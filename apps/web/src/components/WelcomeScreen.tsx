import { useAppState } from '../hooks/useAppState';

interface WelcomeScreenProps {
  appState: ReturnType<typeof useAppState>;
}

export function WelcomeScreen({ appState }: WelcomeScreenProps) {
  const hasProjects = appState.projects.length > 0;

  return (
    <div className="welcome-screen">
      <div className="welcome-logo">KS</div>
      <h1 className="welcome-title">Welcome to KS AGENT</h1>

      {hasProjects ? (
        <>
          <p className="welcome-subtitle">
            Select a project or chat from the sidebar to begin.
            <br />
            What do you want to build or change?
          </p>
          <div style={{ display: 'flex', gap: 12 }}>
            {appState.projects.slice(0, 4).map(p => (
              <div
                key={p.id}
                className="tool-call"
                style={{ width: 160, cursor: 'pointer', borderColor: 'var(--border-light)' }}
                onClick={() => appState.selectProject(p.id)}
              >
                <div className="tool-call-body" style={{ maxHeight: 'none', background: 'transparent' }}>
                  <strong>{p.name}</strong>
                  <br />
                  <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>{p.rootDirectory}</span>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          <p className="welcome-subtitle">
            Create your first project by adding a local directory. KS AGENT will plan, explore, implement, test and review code autonomously with multiple models.
          </p>
        </>
      )}
    </div>
  );
}