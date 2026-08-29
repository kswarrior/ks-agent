const API_BASE = 'http://localhost:3000/api';

export async function fetchServerStatus() {
  const response = await fetch(`${API_BASE}/status`);
  return response.json();
}

export async function startServer() {
  const response = await fetch(`${API_BASE}/start`, { method: 'POST' });
  return response.json();
}

export async function stopServer() {
  const response = await fetch(`${API_BASE}/stop`, { method: 'POST' });
  return response.json();
}

export async function fetchFiles(path = '') {
  const response = await fetch(`${API_BASE}/files${path ? `?path=${encodeURIComponent(path)}` : ''}`);
  return response.json();
}

export async function readFile(path: string) {
  const response = await fetch(`${API_BASE}/files/${encodeURIComponent(path)}`);
  return response.json();
}

export async function saveFile(path: string, content: string) {
  const response = await fetch(`${API_BASE}/files`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, content })
  });
  return response.json();
}

export async function deleteFile(path: string) {
  const response = await fetch(`${API_BASE}/files/${encodeURIComponent(path)}`, {
    method: 'DELETE'
  });
  return response.json();
}

export async function fetchLogs() {
  const response = await fetch(`${API_BASE}/logs`);
  return response.json();
}

export async function readLog(name: string) {
  const response = await fetch(`${API_BASE}/logs/${name}`);
  return response.json();
}

export async function saveConfig(config: any) {
  const response = await fetch(`${API_BASE}/config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config)
  });
  return response.json();
}