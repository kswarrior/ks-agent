import { AppSettings } from '../../types';

interface Props {
  draft: AppSettings;
  update: (s: AppSettings) => Promise<void>;
}

export function AgentSettingsView({ draft, update }: Props) {
  const a = draft.agent;
  const set = (patch: Partial<AppSettings['agent']>) =>
    update({ ...draft, agent: { ...a, ...patch } });
  return (
    <div className="section">
      <h2>Agent</h2>
      <div className="row">
        <span className="label">Autonomous Mode</span>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={a.autonomous_mode}
            onChange={(e) => set({ autonomous_mode: e.target.checked })}
          />
          {a.autonomous_mode ? 'on' : 'off'}
        </label>
      </div>
      <div className="row">
        <span className="label">Maximum fix iterations</span>
        <input
          type="number"
          min={1}
          max={50}
          value={a.max_fix_iterations}
          onChange={(e) => set({ max_fix_iterations: Number(e.target.value) })}
        />
      </div>
      <div className="row">
        <span className="label">Shell approval</span>
        <select
          value={a.shell_approval}
          onChange={(e) => set({ shell_approval: e.target.value as any })}
        >
          <option value="always">Ask every time</option>
          <option value="dangerous">Ask dangerous commands only</option>
          <option value="never">Autonomous</option>
        </select>
      </div>
      <div className="row">
        <span className="label">Automatic tests</span>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={a.automatic_tests}
            onChange={(e) => set({ automatic_tests: e.target.checked })}
          />
          {a.automatic_tests ? 'on' : 'off'}
        </label>
      </div>
      <div className="row">
        <span className="label">Review before completion</span>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={a.review_before_completion}
            onChange={(e) => set({ review_before_completion: e.target.checked })}
          />
          {a.review_before_completion ? 'on' : 'off'}
        </label>
      </div>
      <div className="row">
        <span className="label">Maximum agent steps</span>
        <input
          type="number"
          min={1}
          max={500}
          value={a.max_agent_steps}
          onChange={(e) => set({ max_agent_steps: Number(e.target.value) })}
        />
      </div>
    </div>
  );
}
