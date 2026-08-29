import React, { useState } from 'react';
import { ServerStatus } from '../types';

interface ServerProps {
  status: ServerStatus | null;
}

export function Server({ status }: ServerProps) {
  const [settings, setSettings] = useState({
    maxPlayers: status?.maxPlayers || 20,
    serverPort: 25565,
    onlineMode: true,
    difficulty: 1,
    gamemode: 0,
    world: 'world'
  });

  const handleChange = (key: keyof typeof settings, value: any) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    try {
      await fetch('http://localhost:3000/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
      alert('Configuration saved!');
    } catch (error) {
      console.error('Failed to save:', error);
      alert('Failed to save configuration');
    }
  };

  return (
    <div className="server-settings">
      <h2>Server Settings</h2>
      
      <div className="settings-form">
        <div className="settings-group">
          <label htmlFor="maxPlayers">Max Players:</label>
          <input
            type="number"
            id="maxPlayers"
            value={settings.maxPlayers}
            onChange={(e) => handleChange('maxPlayers', parseInt(e.target.value))}
            min="1"
            max="100"
          />
        </div>

        <div className="settings-group">
          <label htmlFor="serverPort">Server Port:</label>
          <input
            type="number"
            id="serverPort"
            value={settings.serverPort}
            onChange={(e) => handleChange('serverPort', parseInt(e.target.value))}
            min="25000"
            max="30000"
          />
        </div>

        <div className="settings-group">
          <label htmlFor="difficulty">Difficulty (0-2):</label>
          <select
            id="difficulty"
            value={settings.difficulty}
            onChange={(e) => handleChange('difficulty', parseInt(e.target.value))}
          >
            <option value={0}>Peaceful</option>
            <option value={1}>Easy</option>
            <option value={2}>Normal</option>
            <option value={3}>Hard</option>
          </select>
        </div>

        <div className="settings-group">
          <label htmlFor="gamemode">Game Mode:</label>
          <select
            id="gamemode"
            value={settings.gamemode}
            onChange={(e) => handleChange('gamemode', parseInt(e.target.value))}
          >
            <option value={0}>Survival</option>
            <option value={1}>Creative</option>
            <option value={2}>Adventure</option>
            <option value={3}>Spectator</option>
          </select>
        </div>

        <div className="settings-group">
          <label htmlFor="world">World:</label>
          <select
            id="world"
            value={settings.world}
            onChange={(e) => handleChange('world', e.target.value)}
          >
            <option value="world">world</option>
            <option value="world_nether">world_nether</option>
            <option value="world_the_end">world_the_end</option>
          </select>
        </div>

        <div className="settings-group">
          <label htmlFor="onlineMode">Online Mode (Online-only multiplayer):</label>
          <input
            type="checkbox"
            id="onlineMode"
            checked={settings.onlineMode}
            onChange={(e) => handleChange('onlineMode', e.target.checked)}
          />
        </div>
      </div>

      <div className="server-actions">
        <button className="server-button-primary" onClick={handleSave}>
          Save Settings
        </button>
        {status?.running && (
          <button className="server-button-secondary">
            Restart Server
          </button>
        )}
      </div>
    </div>
  );
}