import React from 'react';
import { ServerStatus } from '../types';

interface DashboardProps {
  status: ServerStatus | null;
}

export function Dashboard({ status }: DashboardProps) {
  if (!status) {
    return (
      <div className="dashboard">
        <h2>Loading...</h2>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <h2>Server Overview</h2>
      
      <div className="status-grid">
        <div className="status-card">
          <div className="status-value">{status.players}</div>
          <div className="status-label">Players</div>
          <div className="status-sub">/{status.maxPlayers}</div>
        </div>
        
        <div className="status-card">
          <div className="status-value">{status.tps.toFixed(1)}</div>
          <div className="status-label">TPS</div>
          <div className="status-sub">({Math.floor(status.uptime / 3600)}h)</div>
        </div>
        
        <div className="status-card">
          <div className="status-value">
            {((status.memory.used / status.memory.max) * 100).toFixed(0)}%
          </div>
          <div className="status-label">Memory</div>
          <div className="status-sub">
            {(status.memory.used / 1024 / 1024).toFixed(1)}M / 
            {(status.memory.max / 1024 / 1024).toFixed(1)}M
          </div>
        </div>
      </div>

      <div className="section">
        <h3>Quick Actions</h3>
        <div className="actions-grid">
          <button className="action-button">
            <span className="action-icon">📋</span>
            <span>Console</span>
          </button>
          <button className="action-button">
            <span className="action-icon">📁</span>
            <span>Files</span>
          </button>
          <button className="action-button">
            <span className="action-icon">⚙️</span>
            <span>Settings</span>
          </button>
        </div>
      </div>
    </div>
  );
}