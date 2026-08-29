import React from 'react';
import { ServerStatus } from '../types';

interface NavigationProps {
  currentView: string;
  onViewChange: (view: string) => void;
  status: ServerStatus | null;
  connected: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
}

export function Navigation({ 
  currentView, 
  onViewChange, 
  status, 
  connected,
  onConnect,
  onDisconnect 
}: NavigationProps) {
  const isActive = (view: string) => currentView === view;

  return (
    <nav className="navigation">
      <div className="nav-header">
        <h1>Minecraft Panel</h1>
      </div>
      
      <div className="nav-section">
        <span className="nav-label">Navigation</span>
        <div className="nav-links">
          <button 
            className={isActive('dashboard') ? 'active' : ''}
            onClick={() => onViewChange('dashboard')}
          >
            Dashboard
          </button>
          <button 
            className={isActive('console') ? 'active' : ''}
            onClick={() => onViewChange('console')}
          >
            Console
          </button>
          <button 
            className={isActive('files') ? 'active' : ''}
            onClick={() => onViewChange('files')}
          >
            Files
          </button>
          <button 
            className={isActive('status') ? 'active' : ''}
            onClick={() => onViewChange('status')}
          >
            Server Status
          </button>
        </div>
      </div>

      <div className="nav-section nav-section-bottom">
        <div className="server-status">
          <span className={`status-indicator ${status?.running ? 'online' : 'offline'}`} />
          <span>{status?.running ? 'Online' : 'Offline'}</span>
        </div>
        
        {status?.running && (
          <button 
            className="nav-button"
            onClick={connected ? onDisconnect : onConnect}
          >
            {connected ? 'Disconnect' : 'Connect'}
          </button>
        )}
        
        {!status?.running && (
          <button 
            className="nav-button-primary"
            onClick={() => {
              if (status?.running) {
                fetch('/api/stop', { method: 'POST' });
              } else {
                fetch('/api/start', { method: 'POST' });
              }
            }}
          >
            {status?.running ? 'Stop Server' : 'Start Server'}
          </button>
        )}
      </div>
    </nav>
  );
}