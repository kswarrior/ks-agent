import { Routes, Route, Navigate } from 'react-router-dom';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './components/Dashboard';
import { Console } from './components/Console';
import { Players } from './components/Players';
import { Files } from './components/Files';
import { Backups } from './components/Backups';
import { useEffect, useState } from 'react';
import type { ServerInfo, Player, ConsoleLog, FileNode, BackupInfo } from './types';
import { fetchServerInfo, fetchPlayers, fetchConsoleLogs, fetchFiles, fetchBackups } from './api';
import './App.css';

function App() {
  const [serverInfo, setServerInfo] = useState<ServerInfo | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [consoleLogs, setConsoleLogs] = useState<ConsoleLog[]>([]);
  const [files, setFiles] = useState<FileNode[]>([]);
  const [backups, setBackups] = useState<BackupInfo[]>([]);

  useEffect(() => {
    loadServerInfo();
    loadPlayers();
    loadConsoleLogs();
    loadFiles();
    loadBackups();
  }, []);

  const loadServerInfo = async () => {
    try {
      const data = await fetchServerInfo();
      setServerInfo(data);
    } catch (error) {
      console.error('Failed to load server info:', error);
    }
  };

  const loadPlayers = async () => {
    try {
      const data = await fetchPlayers();
      setPlayers(data);
    } catch (error) {
      console.error('Failed to load players:', error);
    }
  };

  const loadConsoleLogs = async () => {
    try {
      const data = await fetchConsoleLogs();
      setConsoleLogs(data);
    } catch (error) {
      console.error('Failed to load console logs:', error);
    }
  };

  const loadFiles = async () => {
    try {
      const data = await fetchFiles();
      setFiles(data);
    } catch (error) {
      console.error('Failed to load files:', error);
    }
  };

  const loadBackups = async () => {
    try {
      const data = await fetchBackups();
      setBackups(data);
    } catch (error) {
      console.error('Failed to load backups:', error);
    }
  };

  const handleServerStart = async () => {
    try {
      const response = await fetch('/api/server/start', { method: 'POST' });
      const data = await response.json();
      setServerInfo(data.data);
    } catch (error) {
      console.error('Failed to start server:', error);
    }
  };

  const handleServerStop = async () => {
    try {
      const response = await fetch('/api/server/stop', { method: 'POST' });
      const data = await response.json();
      setServerInfo(data.data);
    } catch (error) {
      console.error('Failed to stop server:', error);
    }
  };

  const handleSendCommand = async (command: string) => {
    try {
      const response = await fetch('/api/console/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command }),
      });
      const data = await response.json();
      loadConsoleLogs();
    } catch (error) {
      console.error('Failed to send command:', error);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <Header
        server={serverInfo}
        onStart={handleServerStart}
        onStop={handleServerStop}
      />
      <div style={{ display: 'flex', flex: 1 }}>
        <Sidebar />
        <main className="main">
          <Routes>
            <Route path="/" element={<Dashboard server={serverInfo} />} />
            <Route path="/console" element={
              <Console
                logs={consoleLogs}
                onSendCommand={handleSendCommand}
              />
            } />
            <Route path="/players" element={<Players players={players} />} />
            <Route path="/files" element={<Files files={files} />} />
            <Route path="/backups" element={<Backups backups={backups} />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

export default App;