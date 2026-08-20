import { useEffect, useState, useCallback } from 'react';
import { Sidebar } from './components/Sidebar';
import { ChatPanel } from './components/ChatPanel';
import { ActivityPanel } from './components/ActivityPanel';
import { SettingsPage } from './components/SettingsPage';
import { WelcomeScreen } from './components/WelcomeScreen';
import { useAppState } from './hooks/useAppState';
import { useWebSocket } from './hooks/useWebSocket';

export default function App() {
  const appState = useAppState();
  const { connected, eventLog } = useWebSocket();
  const [showSettings, setShowSettings] = useState(false);
  const [activityEvents, setActivityEvents] = useState(eventLog);
  const [currentRunId, setCurrentRunId] = useState<string | null>(null);

  useEffect(() => {
    appState.loadProjects();
  }, []);

  useEffect(() => {
    setActivityEvents(eventLog);
  }, [eventLog]);

  const handleSendMessage = useCallback(async (message: string) => {
    const runId = await appState.sendMessage(message);
    if (runId) {
      setCurrentRunId(runId);
    }
  }, [appState]);

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-title">
          <span className="app-logo">KS</span>
          <span className="app-name">AGENT</span>
        </div>
        <div className="app-header-right">
          {connected ? (
            <span className="status-chip connected">● live</span>
          ) : (
            <span className="status-chip disconnected">○ connecting</span>
          )}
          <button
            className="btn btn-header"
            onClick={() => setShowSettings(!showSettings)}
          >
            Settings
          </button>
        </div>
      </header>

      <main className="app-body">
        <Sidebar appState={appState} />
        
        {!showSettings && (
          <>
            {appState.selectedChatId ? (
              <ChatPanel
                appState={appState}
                runId={currentRunId}
                onSend={handleSendMessage}
                events={eventLog}
              />
            ) : (
              <WelcomeScreen appState={appState} />
            )}
            <ActivityPanel events={activityEvents} />
          </>
        )}

        {showSettings && <SettingsPage />}
      </main>
    </div>
  );
}