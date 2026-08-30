import React, { useState, useEffect, useRef } from 'react';
import { api } from './api';
import { ServerStatus, Player, ConsoleMessage } from './types';

// SVG Icons as React components
const ServerIcon = () => (
  <svg className="icon icon-server" viewBox="0 0 24 24">
    <path d="M2 13v4a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-4" stroke="currentColor" fill="none" />
    <path d="M12 2v20" stroke="currentColor" fill="none" />
    <path d="M8 12h8" stroke="currentColor" fill="none" />
  </svg>
);

const ConsoleIcon = () => (
  <svg className="icon icon-console" viewBox="0 0 24 24">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" stroke="currentColor" fill="none" />
    <line x1="8" y1="12" x2="16" y2="12" stroke="currentColor" />
    <line x1="3" y1="9" x2="21" y2="9" stroke="currentColor" />
  </svg>
);

const FilesIcon = () => (
  <svg className="icon icon-files" viewBox="0 0 24 24">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" fill="none" />
    <polyline points="14 2 14 8 20 8" stroke="currentColor" fill="none" />
  </svg>
);

const PlayersIcon = () => (
  <svg className="icon icon-players" viewBox="0 0 24 24">
    <circle cx="12" cy="7" r="4" stroke="currentColor" fill="none" />
    <path d="M8 22v-3" stroke="currentColor" fill="none" />
    <path d="M16 22v-3" stroke="currentColor" fill="none" />
    <path d="M5 21a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v-1a4 4 0 0 0-3.5-3.95" stroke="currentColor" fill="none" />
  </svg>
);

const ConfigIcon = () => (
  <svg className="icon icon-config" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="3" stroke="currentColor" fill="none" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .2 1.3l-2.5 4a1.65 1.65 0 0 1-1.4.9h-4a1.65 1.65 0 0 1-1.4-.9l-2.5-4a1.65 1.65 0 0 1 .2-1.3v-3a1.65 1.65 0 0 1-.9-1.4L4.7 7.35a1.65 1.65 0 0 1 .2-1.3L8.3 2.35a1.65 1.65 0 0 1 1.4-.9h4a1.65 1.65 0 0 1 1.4.9l2.5 4a1.65 1.65 0 0 1-.2 1.3z" stroke="currentColor" fill="none" />
  </svg>
);

const RefreshIcon = () => (
  <svg className="icon" viewBox="0 0 24 24">
    <path d="M23 12a23 23 0 0 1-7 19 23 23 0 0 1-7-19" stroke="currentColor" fill="none" />
    <path d="M23 12a23 23 0 0 0-7-19 23 23 0 0 0-7 19" stroke="currentColor" fill="none" />
  </svg>
);

const DeleteIcon = () => (
  <svg className="icon" viewBox="0 0 24 24">
    <polyline points="3 6 5 6 21 6" stroke="currentColor" fill="none" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" stroke="currentColor" fill="none" />
  </svg>
);

const PlusIcon = () => (
  <svg className="icon" viewBox="0 0 24 24">
    <line x1="12" y1="5" x2="12" y2="19" stroke="currentColor" fill="none" />
    <line x1="5" y1="12" x2="19" y2="12" stroke="currentColor" fill="none" />
  </svg>
);

const EditIcon = () => (
  <svg className="icon" viewBox="0 0 24 24">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" stroke="currentColor" fill="none" />
    <path d="M18 16.5l-2-2" stroke="currentColor" fill="none" />
    <path d="M12 4l5 5" stroke="currentColor" fill="none" />
    <path d="M8 10h5" stroke="currentColor" fill="none" />
  </svg>
);

// Sidebar component
const Sidebar: React.FC<{ activeTab: string; onTabChange: (tab: string) => void }> = ({ activeTab, onTabChange }) => {
  const tabs = [
    { id: 'dashboard', name: 'Dashboard', icon: DashboardIcon },
    { id: 'server', name: 'Server', icon: ServerIcon },
    { id: 'players', name: 'Players', icon: PlayersIcon },
    { id: 'files', name: 'Files', icon: FilesIcon },
    { id: 'console', name: 'Console', icon: ConsoleIcon },
    { id: 'config', name: 'Config', icon: ConfigIcon },
  ];

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-line"></div>
        <div className="sidebar-line"></div>
        <div className="sidebar-line"></div>
      </div>
      <div className="sidebar-nav">
        {tabs.map(tab => (
          <a
            key={tab.id}
            href={`#${tab.id}`}
            className={`sidebar-nav-item ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => onTabChange(tab.id)}
          >
            <tab.icon />
            {tab.name}
          </a>
        ))}
      </div>
    </div>
  );
};

function DashboardIcon() {
  return (
    <svg className="icon" viewBox="0 0 24 24">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" stroke="currentColor" fill="none" />
      <line x1="3" y1="9" x2="21" y2="9" stroke="currentColor" fill="none" />
      <line x1="9" y1="21" x2="9" y2="9" stroke="currentColor" fill="none" />
    </svg>
  );
}

// Dashboard component
const Dashboard: React.FC = () => {
  const [status, setStatus] = useState<ServerStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStatus();
    const interval = setInterval(loadStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const loadStatus = async () => {
    try {
      const data = await api.getStatus();
      setStatus(data.status);
    } catch (error) {
      console.error('Failed to load status:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading || !status) {
    return (
      <div className="dashboard-content">
        <div className="stats-grid">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="stat-card">
              <div className="skeleton" style={{ height: '24px', marginBottom: '8px' }}></div>
              <div className="skeleton" style={{ height: '32px', marginBottom: '8px' }}></div>
              <div className="skeleton" style={{ height: '12px' }}></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-content">
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Status</div>
          <div className="stat-value" style={{ color: status.running ? '#22c55e' : '#ef4444' }}>
            {status.running ? 'Online' : 'Offline'}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Players</div>
          <div className="stat-value">{status.players}/{20}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">TPS</div>
          <div className="stat-value">{status.tps}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Memory</div>
          <div className="stat-value">{status.memory.used}MB / {status.memory.max}MB</div>
        </div>
      </div>
    </div>
  );
};

// Server control component
const ServerControl: React.FC = () => {
  const [status, setStatus] = useState<ServerStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStatus();
  }, []);

  const loadStatus = async () => {
    try {
      const data = await api.getStatus();
      setStatus(data.status);
    } catch (error) {
      console.error('Failed to load status:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleStart = async () => {
    await api.startServer();
    loadStatus();
  };

  const handleStop = async () => {
    await api.stopServer();
    loadStatus();
  };

  const handleRestart = async () => {
    await api.restartServer();
    loadStatus();
  };

  if (loading || !status) {
    return (
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Server Control</h2>
        </div>
        <div className="skeleton" style={{ height: '40px', marginBottom: '16px' }}></div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <div className="skeleton" style={{ flex: 1, height: '40px' }}></div>
          <div className="skeleton" style={{ flex: 1, height: '40px' }}></div>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title">Server Control</h2>
        <button onClick={loadStatus} className="status-btn" style={{ background: 'var(--color-bg-secondary)' }}>
          <RefreshIcon />
          <RefreshIcon />
        </button>
      </div>
      <div style={{ display: 'flex', gap: '16px', alignItems: 'center', marginBottom: '16px' }}>
        <div>
          <strong>Status:</strong>{' '}
          <span style={{ color: status.running ? '#22c55e' : '#ef4444', fontWeight: 'bold' }}>
            {status.running ? 'Running' : 'Stopped'}
          </span>
        </div>
        <div>
          <strong>TPS:</strong> {status.tps}
        </div>
      </div>
      <div style={{ display: 'flex', gap: '12px' }}>
        {!status.running ? (
          <button onClick={handleStart} className="status-btn running">
            Start Server
          </button>
        ) : (
          <button onClick={handleStop} className="status-btn stopped">
            Stop Server
          </button>
        )}
        <button onClick={handleRestart} className="status-btn" style={{ background: 'var(--color-warning)', color: 'white' }}>
          Restart
        </button>
      </div>
    </div>
  );
};

// Players component
const Players: React.FC = () => {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPlayers();
  }, []);

  const loadPlayers = async () => {
    try {
      const data = await api.getPlayers();
      setPlayers(data.players);
    } catch (error) {
      console.error('Failed to load players:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleKick = async (id: number) => {
    await api.kickPlayer(id.toString());
    loadPlayers();
  };

  const handleBan = async (id: number) => {
    await api.banPlayer(id.toString());
    loadPlayers();
  };

  if (loading) {
    return (
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Players</h2>
        </div>
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="player-item">
            <div className="skeleton" style={{ height: '16px', width: '80%', marginBottom: '8px' }}></div>
            <div className="skeleton" style={{ height: '12px', width: '50px' }}></div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title">Players ({players.length})</h2>
      </div>
      {players.map(player => (
        <div key={player.id} className="player-item">
          <div className="player-info">
            <span className="player-name">
              {player.name}
              <span className={`player-status ${player.isOnline ? 'online' : 'offline'}`}></span>
            </span>
            <small style={{ color: 'var(--color-text-secondary)' }}>Ping: {player.ping}ms</small>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {player.isOnline && (
              <>
                <button onClick={() => handleKick(player.id)} className="status-btn" style={{ background: 'var(--color-warning)', color: 'white' }}>
                  <svg className="icon" viewBox="0 0 24 24" style={{ width: 14, height: 14 }}>
                    <polyline points="23 6 16 13 7 6" stroke="currentColor" fill="none" />
                  </svg>
                </button>
                <button onClick={() => handleBan(player.id)} className="status-btn" style={{ background: 'var(--color-error)', color: 'white' }}>
                  <DeleteIcon />
                </button>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

// Files component
const Files: React.FC = () => {
  const [files, setFiles] = useState<{ name: string; type: string; path: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPath, setCurrentPath] = useState('');
  const [editedContent, setEditedContent] = useState<Record<string, string>>({});

  useEffect(() => {
    loadFiles();
  }, [currentPath]);

  const loadFiles = async () => {
    try {
      const data = await api.getFiles(currentPath);
      setFiles(data.files);
    } catch (error) {
      console.error('Failed to load files:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFileRead = async (path: string) => {
    try {
      const data = await api.readFile(path);
      setEditedContent(prev => ({ ...prev, [path]: data.content }));
    } catch (error) {
      console.error('Failed to read file:', error);
    }
  };

  const handleFileWrite = async (path: string) => {
    await api.writeFile(path, editedContent[path] || '');
    handleFileRead(path); // Refresh content
  };

  const handleFileDelete = async (path: string) => {
    await api.deleteFile(path);
    loadFiles();
  };

  if (loading || files.length === 0) {
    return (
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Files</h2>
        </div>
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="file-item">
            <div className="skeleton" style={{ height: '16px', width: '80%' }}></div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title">Files</h2>
        <div>
          <FilesIcon />
        </div>
      </div>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <button 
          onClick={() => setCurrentPath('')} 
          style={{ 
            padding: '8px 12px', 
            borderRadius: '6px', 
            border: '1px solid var(--color-border)',
            background: currentPath === '' ? 'var(--color-primary)' : 'white',
            color: currentPath === '' ? 'white' : 'var(--color-text)',
            cursor: 'pointer'
          }}
        >
          <PlusIcon />
          Root
        </button>
        <button 
          onClick={() => setCurrentPath('logs')} 
          style={{ 
            padding: '8px 12px', 
            borderRadius: '6px', 
            border: '1px solid var(--color-border)',
            background: currentPath === 'logs' ? 'var(--color-primary)' : 'white',
            color: currentPath === 'logs' ? 'white' : 'var(--color-text)',
            cursor: 'pointer'
          }}
        >
          logs
        </button>
        <button 
          onClick={() => setCurrentPath('plugins')} 
          style={{ 
            padding: '8px 12px', 
            borderRadius: '6px', 
            border: '1px solid var(--color-border)',
            background: currentPath === 'plugins' ? 'var(--color-primary)' : 'white',
            color: currentPath === 'plugins' ? 'white' : 'var(--color-text)',
            cursor: 'pointer'
          }}
        >
          plugins
        </button>
        <button 
          onClick={() => setCurrentPath('world')} 
          style={{ 
            padding: '8px 12px', 
            borderRadius: '6px', 
            border: '1px solid var(--color-border)',
            background: currentPath === 'world' ? 'var(--color-primary)' : 'white',
            color: currentPath === 'world' ? 'white' : 'var(--color-text)',
            cursor: 'pointer'
          }}
        >
          world
        </button>
      </div>
      <div style={{ maxHeight: '300px', overflow: 'auto' }}>
        {files.map(file => (
          <div key={file.path} style={{ marginBottom: '8px' }}>
            {file.type === 'directory' ? (
              <div className="file-item" onClick={() => setCurrentPath(file.path)}>
                <span style={{ color: 'var(--color-secondary)' }}>📁</span>
                <span style={{ marginLeft: '8px' }}>{file.name}</span>
              </div>
            ) : (
              <div style={{ marginBottom: '8px' }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <span style={{ color: 'var(--color-secondary)' }}>📄</span>
                  <span style={{ marginLeft: '8px' }}>{file.name}</span>
                  <button onClick={() => handleFileRead(file.path)} style={{ marginLeft: 'auto' }}>
                    <EditIcon />
                  </button>
                  <button onClick={() => handleFileDelete(file.path)}>
                    <DeleteIcon />
                  </button>
                </div>
                {editedContent[file.path] !== undefined && (
                  <textarea
                    value={editedContent[file.path]}
                    onChange={e => setEditedContent(prev => ({ ...prev, [file.path]: e.target.value }))}
                    style={{ 
                      width: '100%', 
                      marginTop: '8px', 
                      padding: '8px', 
                      borderRadius: '6px',
                      border: '1px solid var(--color-border)',
                      fontFamily: 'monospace',
                      fontSize: '12px',
                      minHeight: '100px'
                    }}
                  />
                )}
                {editedContent[file.path] !== undefined && (
                  <button 
                    onClick={() => handleFileWrite(file.path)}
                    style={{ 
                      marginTop: '8px', 
                      padding: '6px 12px', 
                      borderRadius: '6px',
                      background: 'var(--color-primary)',
                      color: 'white',
                      border: 'none',
                      cursor: 'pointer'
                    }}
                  >
                    Save
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

// Console component with SSE
const Console: React.FC = () => {
  const [messages, setMessages] = useState<ConsoleMessage[]>([]);
  const [command, setCommand] = useState('');
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    loadMessages();
    
    // Setup SSE connection
    const eventSource = api.getConsoleStream();
    eventSourceRef.current = eventSource;
    
    eventSource.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        setMessages(prev => [...prev, message]);
      } catch (error) {
        console.error('Failed to parse SSE message:', error);
      }
    };
    
    return () => {
      eventSource.close();
    };
  }, []);

  const loadMessages = async () => {
    try {
      const data = await api.getConsoleMessages();
      setMessages(data.messages);
    } catch (error) {
      console.error('Failed to load console messages:', error);
    }
  };

  const handleSendCommand = async () => {
    if (!command.trim()) return;
    
    await api.sendCommand(command);
    setCommand('');
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSendCommand();
    }
  };

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title">Server Console</h2>
        <ConsoleIcon />
      </div>
      <div className="console-output">
        {messages.map((msg, index) => (
          <div key={index} className={`output-line ${msg.type === 'input' ? 'output-line' : ''}`}>
            <span style={{ color: msg.type === 'input' ? '#fbbf24' : '#22c55e' }}>[
              {msg.type === 'input' ? 'COMMAND' : 'SERVER'}
            ]</span>{' '}
            {msg.content}
          </div>
        ))}
      </div>
      <div className="console-input">
        <input
          type="text"
          value={command}
          onChange={e => setCommand(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Enter command..."
          style={{ 
            flex: 1, 
            padding: '10px', 
            borderRadius: '6px',
            border: '1px solid var(--color-border)',
            fontFamily: 'monospace'
          }}
        />
        <button onClick={handleSendCommand} className="status-btn running">
          Send
        </button>
      </div>
    </div>
  );
};

// Config component
const Config: React.FC = () => {
  const [config, setConfig] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const data = await api.getConfig();
      setConfig(data.config);
    } catch (error) {
      console.error('Failed to load config:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.updateConfig(config);
    } catch (error) {
      console.error('Failed to save config:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (key: string, value: any) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  };

  if (loading) {
    return (
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Server Configuration</h2>
        </div>
        {[1, 2, 3, 4, 5, 6].map(i => (
          <div key={i} style={{ marginBottom: '16px' }}>
            <div className="skeleton" style={{ height: '20px', width: '60%', marginBottom: '8px' }}></div>
            <div className="skeleton" style={{ height: '28px', width: '100%' }}></div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title">Server Configuration</h2>
        <button onClick={loadConfig} className="status-btn" style={{ background: 'var(--color-bg-secondary)' }}>
          <RefreshIcon />
        </button>
      </div>
      {Object.entries(config).map(([key, value]) => (
        <div key={key} style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>
            {key}
          </label>
          {typeof value === 'boolean' ? (
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="checkbox"
                checked={value as boolean}
                onChange={e => handleChange(key, e.target.checked)}
              />
              {String(value)}
            </label>
          ) : typeof value === 'number' ? (
            <input
              type="number"
              value={value as number}
              onChange={e => handleChange(key, parseInt(e.target.value))}
              style={{ width: '120px', padding: '8px', borderRadius: '6px', border: '1px solid var(--color-border)' }}
            />
          ) : (
            <input
              type="text"
              value={value as string}
              onChange={e => handleChange(key, e.target.value)}
              style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--color-border)' }}
            />
          )}
        </div>
      ))}
      <button onClick={handleSave} className="status-btn running" disabled={saving}>
        {saving ? 'Saving...' : 'Save Configuration'}
      </button>
    </div>
  );
};

// Main App component
const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState('dashboard');

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <Dashboard />;
      case 'server':
        return <ServerControl />;
      case 'players':
        return <Players />;
      case 'files':
        return <Files />;
      case 'console':
        return <Console />;
      case 'config':
        return <Config />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', width: '100%' }}>
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />
      <main className="main-content">
        <h1 style={{ fontSize: '24px', fontWeight: 600, marginBottom: '24px' }}>KS Minecraft Server Panel</h1>
        {renderContent()}
      </main>
    </div>
  );
};

export default App;