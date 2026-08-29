import React, { useState, useEffect } from 'react';
import { Dashboard } from './components/Dashboard';
import { Console } from './components/Console';
import { FileBrowser } from './components/FileBrowser';
import { Status } from './components/Status';
import { Server } from './components/Server';
import { Navigation } from './components/Navigation';
import './styles.css';

export function App() {
  const [currentView, setCurrentView] = useState('dashboard');
  const [serverStatus, setServerStatus] = useState(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const fetchStatus = async () => {
    try {
      const response = await fetch('http://localhost:3000/api/status');
      const data = await response.json();
      setServerStatus(data);
    } catch (error) {
      console.error('Failed to fetch status:', error);
    }
  };

  const renderView = () => {
    switch (currentView) {
      case 'dashboard':
        return <Dashboard status={serverStatus} />;
      case 'console':
        return <Console />;
      case 'files':
        return <FileBrowser />;
      case 'status':
        return <Status />;
      case 'server':
        return <Server status={serverStatus} />;
      default:
        return <Dashboard status={serverStatus} />;
    }
  };

  return (
    <div className="app">
      <Navigation 
        currentView={currentView} 
        onViewChange={setCurrentView} 
        status={serverStatus}
        connected={connected}
        onConnect={() => setConnected(true)}
        onDisconnect={() => setConnected(false)}
      />
      <main className="main-content">
        {renderView()}
      </main>
    </div>
  );
}