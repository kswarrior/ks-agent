const express = require('express');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');
const { spawn } = require('child_process');
const fs = require('fs');
const multer = require('multer');
const archiver = require('archiver');
const unzipper = require('unzipper');
const chokidar = require('chokidar');
const si = require('systeminformation');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Configuration
const CONFIG = {
  port: 4000,
  serverDir: path.join(__dirname, 'minecraft-server'),
  backupDir: path.join(__dirname, 'backups'),
  javaCmd: 'java',
  javaArgs: ['-Xmx2G', '-Xms1G', '-jar', 'server.jar', 'nogui'],
  rconPort: 25575,
  rconPassword: 'changeme'
};

// Ensure directories exist
[CONFIG.serverDir, CONFIG.backupDir].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Multer for file uploads
const upload = multer({ dest: path.join(CONFIG.serverDir, 'uploads') });

// Server state
let minecraftProcess = null;
let serverStatus = 'stopped';
let consoleBuffer = [];
const MAX_BUFFER = 500;
const clients = new Set();

// Broadcast to all WebSocket clients
function broadcast(message) {
  const data = JSON.stringify(message);
  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}

// Start Minecraft server
function startServer() {
  if (minecraftProcess) return { success: false, message: 'Server already running' };

  const jarPath = path.join(CONFIG.serverDir, 'server.jar');
  if (!fs.existsSync(jarPath)) {
    return { success: false, message: 'server.jar not found. Please upload a server jar first.' };
  }

  serverStatus = 'starting';
  broadcast({ type: 'status', status: 'starting' });

  minecraftProcess = spawn(CONFIG.javaCmd, CONFIG.javaArgs, {
    cwd: CONFIG.serverDir,
    stdio: ['pipe', 'pipe', 'pipe']
  });

  minecraftProcess.stdout.on('data', (data) => {
    const lines = data.toString().split('\n').filter(l => l.trim());
    lines.forEach(line => {
      consoleBuffer.push({ time: new Date().toISOString(), line, type: 'stdout' });
      if (consoleBuffer.length > MAX_BUFFER) consoleBuffer.shift();
      broadcast({ type: 'console', line, time: new Date().toISOString() });
    });
  });

  minecraftProcess.stderr.on('data', (data) => {
    const lines = data.toString().split('\n').filter(l => l.trim());
    lines.forEach(line => {
      consoleBuffer.push({ time: new Date().toISOString(), line, type: 'stderr' });
      if (consoleBuffer.length > MAX_BUFFER) consoleBuffer.shift();
      broadcast({ type: 'console', line, time: new Date().toISOString(), error: true });
    });
  });

  minecraftProcess.on('close', (code) => {
    minecraftProcess = null;
    serverStatus = 'stopped';
    broadcast({ type: 'status', status: 'stopped' });
    broadcast({ type: 'console', line: `Server stopped with code ${code}`, time: new Date().toISOString(), error: true });
  });

  minecraftProcess.on('error', (err) => {
    minecraftProcess = null;
    serverStatus = 'error';
    broadcast({ type: 'status', status: 'error' });
    broadcast({ type: 'console', line: `Error: ${err.message}`, time: new Date().toISOString(), error: true });
  });

  // Wait a bit to confirm it's starting
  setTimeout(() => {
    if (minecraftProcess && !minecraftProcess.killed) {
      serverStatus = 'running';
      broadcast({ type: 'status', status: 'running' });
    }
  }, 3000);

  return { success: true, message: 'Server starting...' };
}

// Stop Minecraft server
function stopServer() {
  if (!minecraftProcess) return { success: false, message: 'Server not running' };

  minecraftProcess.stdin.write('stop\n');
  return { success: true, message: 'Stop command sent' };
}

// Send command to server
function sendCommand(command) {
  if (!minecraftProcess || minecraftProcess.killed) {
    return { success: false, message: 'Server not running' };
  }
  minecraftProcess.stdin.write(command + '\n');
  return { success: true, message: 'Command sent' };
}

// Get server status
function getStatus() {
  return {
    status: serverStatus,
    pid: minecraftProcess?.pid || null,
    uptime: minecraftProcess ? Math.floor((Date.now() - minecraftProcess.spawnTime) / 1000) : 0
  };
}

// Read server.properties
function readProperties() {
  const propsPath = path.join(CONFIG.serverDir, 'server.properties');
  if (!fs.existsSync(propsPath)) return {};
  const content = fs.readFileSync(propsPath, 'utf-8');
  const props = {};
  content.split('\n').forEach(line => {
    line = line.trim();
    if (line && !line.startsWith('#')) {
      const [key, ...val] = line.split('=');
      props[key.trim()] = val.join('=').trim();
    }
  });
  return props;
}

// Write server.properties
function writeProperties(props) {
  const propsPath = path.join(CONFIG.serverDir, 'server.properties');
  let content = '# Minecraft server properties\n# Generated by Panel\n';
  content += new Date().toUTCString() + '\n';
  for (const [key, value] of Object.entries(props)) {
    content += `${key}=${value}\n`;
  }
  fs.writeFileSync(propsPath, content);
  return { success: true };
}

// List files in directory
function listFiles(dir) {
  const fullPath = path.join(CONFIG.serverDir, dir);
  if (!fs.existsSync(fullPath)) return [];
  const relativePath = path.relative(CONFIG.serverDir, fullPath);
  if (relativePath.startsWith('..')) return [];

  return fs.readdirSync(fullPath).map(name => {
    const filePath = path.join(fullPath, name);
    const stat = fs.statSync(filePath);
    return {
      name,
      path: path.join(relativePath === '.' ? '' : relativePath, name),
      isDirectory: stat.isDirectory(),
      size: stat.size,
      modified: stat.mtime
    };
  });
}

// Read file content
function readFile(filePath) {
  const fullPath = path.join(CONFIG.serverDir, filePath);
  if (!fs.existsSync(fullPath)) return null;
  if (fs.statSync(fullPath).isDirectory()) return null;
  return fs.readFileSync(fullPath, 'utf-8');
}

// Write file content
function writeFile(filePath, content) {
  const fullPath = path.join(CONFIG.serverDir, filePath);
  const dir = path.dirname(fullPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(fullPath, content);
  return { success: true };
}

// Delete file/folder
function deletePath(filePath) {
  const fullPath = path.join(CONFIG.serverDir, filePath);
  if (!fs.existsSync(fullPath)) return { success: false, message: 'Not found' };
  fs.rmSync(fullPath, { recursive: true, force: true });
  return { success: true };
}

// Create backup
function createBackup() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupName = `backup-${timestamp}.zip`;
  const backupPath = path.join(CONFIG.backupDir, backupName);

  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(backupPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => {
      resolve({ success: true, name: backupName, size: archive.pointer() });
    });

    archive.on('error', (err) => reject({ success: false, message: err.message }));
    archive.pipe(output);
    archive.directory(CONFIG.serverDir, false);
    archive.finalize();
  });
}

// List backups
function listBackups() {
  if (!fs.existsSync(CONFIG.backupDir)) return [];
  return fs.readdirSync(CONFIG.backupDir)
    .filter(f => f.endsWith('.zip'))
    .map(name => {
      const stat = fs.statSync(path.join(CONFIG.backupDir, name));
      return { name, size: stat.size, created: stat.birthtime };
    })
    .sort((a, b) => b.created - a.created);
}

// Restore backup
function restoreBackup(name) {
  const backupPath = path.join(CONFIG.backupDir, name);
  if (!fs.existsSync(backupPath)) return { success: false, message: 'Backup not found' };

  // Clear server directory (except backups folder)
  fs.readdirSync(CONFIG.serverDir).forEach(item => {
    if (item !== 'backups') {
      fs.rmSync(path.join(CONFIG.serverDir, item), { recursive: true, force: true });
    }
  });

  return new Promise((resolve, reject) => {
    fs.createReadStream(backupPath)
      .pipe(unzipper.Extract({ path: CONFIG.serverDir }))
      .on('close', () => resolve({ success: true }))
      .on('error', (err) => reject({ success: false, message: err.message }));
  });
}

// Delete backup
function deleteBackup(name) {
  const backupPath = path.join(CONFIG.backupDir, name);
  if (!fs.existsSync(backupPath)) return { success: false, message: 'Not found' };
  fs.unlinkSync(backupPath);
  return { success: true };
}

// Get system info
async function getSystemInfo() {
  const [cpu, mem, disk, os] = await Promise.all([
    si.currentLoad(),
    si.mem(),
    si.fsSize(),
    si.osInfo()
  ]);
  return {
    cpu: { load: cpu.currentLoad.toFixed(1), cores: cpu.cpus.length },
    memory: { total: mem.total, used: mem.active, free: mem.free },
    disk: disk[0] ? { size: disk[0].size, used: disk[0].used, available: disk[0].available } : null,
    os: { platform: os.platform, distro: os.distro, release: os.release }
  };
}

// WebSocket handling
wss.on('connection', (ws) => {
  clients.add(ws);
  ws.send(JSON.stringify({ type: 'init', buffer: consoleBuffer, status: serverStatus }));

  ws.on('close', () => clients.delete(ws));
  ws.on('error', () => clients.delete(ws));
});

// Routes
app.get('/', (req, res) => res.redirect('/dashboard'));

app.get('/dashboard', async (req, res) => {
  const sysInfo = await getSystemInfo();
  res.render('dashboard', {
    title: 'Dashboard',
    status: getStatus(),
    system: sysInfo,
    activePage: 'dashboard'
  });
});

app.get('/console', (req, res) => {
  res.render('console', {
    title: 'Console',
    buffer: consoleBuffer,
    status: getStatus(),
    activePage: 'console'
  });
});

app.get('/files', (req, res) => {
  const dir = req.query.dir || '';
  const files = listFiles(dir);
  const breadcrumbs = dir.split('/').filter(Boolean);
  res.render('files', {
    title: 'File Manager',
    files,
    currentDir: dir,
    breadcrumbs,
    activePage: 'files'
  });
});

app.get('/files/view', (req, res) => {
  const file = req.query.file;
  const content = readFile(file);
  if (content === null) return res.status(404).send('File not found');
  res.render('file-view', {
    title: `View: ${file}`,
    file,
    content,
    activePage: 'files'
  });
});

app.post('/files/save', (req, res) => {
  const { file, content } = req.body;
  const result = writeFile(file, content);
  res.json(result);
});

app.post('/files/delete', (req, res) => {
  const { path: filePath } = req.body;
  const result = deletePath(filePath);
  res.json(result);
});

app.post('/files/upload', upload.array('files'), (req, res) => {
  const targetDir = req.body.dest || '';
  const results = req.files.map(f => ({
    name: f.originalname,
    path: path.join(targetDir, f.originalname),
    size: f.size
  }));
  res.json({ success: true, files: results });
});

app.post('/files/new-folder', (req, res) => {
  const { path: dirPath, name } = req.body;
  const fullPath = path.join(CONFIG.serverDir, dirPath, name);
  fs.mkdirSync(fullPath, { recursive: true });
  res.json({ success: true });
});

app.get('/settings', (req, res) => {
  const props = readProperties();
  res.render('settings', {
    title: 'Settings',
    properties: props,
    activePage: 'settings'
  });
});

app.post('/settings', (req, res) => {
  const result = writeProperties(req.body);
  res.json(result);
});

app.get('/backups', (req, res) => {
  const backups = listBackups();
  res.render('backups', {
    title: 'Backups',
    backups,
    activePage: 'backups'
  });
});

app.post('/backups/create', async (req, res) => {
  try {
    const result = await createBackup();
    res.json(result);
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

app.post('/backups/restore', async (req, res) => {
  const { name } = req.body;
  try {
    const result = await restoreBackup(name);
    res.json(result);
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

app.post('/backups/delete', (req, res) => {
  const { name } = req.body;
  const result = deleteBackup(name);
  res.json(result);
});

app.get('/players', (req, res) => {
  // Read whitelist, ops, banned players
  const readList = (filename) => {
    const filePath = path.join(CONFIG.serverDir, filename);
    if (!fs.existsSync(filePath)) return [];
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch {
      return [];
    }
  };

  res.render('players', {
    title: 'Players',
    whitelist: readList('whitelist.json'),
    ops: readList('ops.json'),
    banned: readList('banned-players.json'),
    activePage: 'players'
  });
});

app.post('/players/whitelist', (req, res) => {
  const { action, uuid, name } = req.body;
  const filePath = path.join(CONFIG.serverDir, 'whitelist.json');
  let list = [];
  if (fs.existsSync(filePath)) list = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

  if (action === 'add') {
    list.push({ uuid, name });
  } else if (action === 'remove') {
    list = list.filter(p => p.uuid !== uuid);
  }
  fs.writeFileSync(filePath, JSON.stringify(list, null, 2));
  sendCommand(`whitelist ${action} ${name}`);
  res.json({ success: true });
});

app.post('/players/ops', (req, res) => {
  const { action, name } = req.body;
  sendCommand(`op ${action === 'add' ? name : 'remove'} ${name}`);
  res.json({ success: true });
});

app.get('/plugins', (req, res) => {
  const pluginsDir = path.join(CONFIG.serverDir, 'plugins');
  const modsDir = path.join(CONFIG.serverDir, 'mods');
  const plugins = fs.existsSync(pluginsDir) ? fs.readdirSync(pluginsDir).filter(f => f.endsWith('.jar')) : [];
  const mods = fs.existsSync(modsDir) ? fs.readdirSync(modsDir).filter(f => f.endsWith('.jar')) : [];

  res.render('plugins', {
    title: 'Plugins & Mods',
    plugins,
    mods,
    activePage: 'plugins'
  });
});

app.post('/plugins/upload', upload.single('file'), (req, res) => {
  const type = req.body.type || 'plugins';
  const targetDir = path.join(CONFIG.serverDir, type);
  if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
  const dest = path.join(targetDir, req.file.originalname);
  fs.renameSync(req.file.path, dest);
  res.json({ success: true, name: req.file.originalname });
});

app.post('/plugins/delete', (req, res) => {
  const { type, name } = req.body;
  const filePath = path.join(CONFIG.serverDir, type, name);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  res.json({ success: true });
});

// API endpoints
app.post('/api/server/start', (req, res) => {
  const result = startServer();
  res.json(result);
});

app.post('/api/server/stop', (req, res) => {
  const result = stopServer();
  res.json(result);
});

app.post('/api/server/restart', (req, res) => {
  stopServer();
  setTimeout(() => {
    const result = startServer();
    res.json(result);
  }, 2000);
});

app.post('/api/server/command', (req, res) => {
  const { command } = req.body;
  const result = sendCommand(command);
  res.json(result);
});

app.get('/api/server/status', (req, res) => {
  res.json(getStatus());
});

app.get('/api/system', async (req, res) => {
  const info = await getSystemInfo();
  res.json(info);
});

// Start server
server.listen(CONFIG.port, () => {
  console.log(`Minecraft Server Panel running on http://localhost:${CONFIG.port}`);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  if (minecraftProcess) minecraftProcess.kill('SIGTERM');
  server.close(() => process.exit(0));
});

module.exports = app;