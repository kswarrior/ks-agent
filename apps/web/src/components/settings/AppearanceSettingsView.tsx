import { AppSettings } from '../../types';

interface Props {
  draft: AppSettings;
  update: (s: AppSettings) => Promise<void>;
}

export function AppearanceSettingsView({ draft, update }: Props) {
  const a = draft.appearance;
  const set = (patch: Partial<AppSettings['appearance']>) =>
    update({ ...draft, appearance: { ...a, ...patch } });
  return (
    <div className="section">
      <h2>Appearance</h2>
      <div className="row">
        <span className="label">Background type</span>
        <select
          value={a.background_type}
          onChange={(e) => set({ background_type: e.target.value as any })}
        >
          <option value="image">Image</option>
          <option value="color">Solid Color</option>
        </select>
      </div>
      {a.background_type === 'image' ? (
        <div className="row">
          <span className="label">Background image URL</span>
          <input
            value={a.background_image_url}
            onChange={(e) => set({ background_image_url: e.target.value })}
          />
        </div>
      ) : (
        <div className="row">
          <span className="label">Background color</span>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              type="color"
              value={a.background_color}
              onChange={(e) => set({ background_color: e.target.value })}
              style={{ width: 50 }}
            />
            <input
              value={a.background_color}
              onChange={(e) => set({ background_color: e.target.value })}
              placeholder="#000000"
            />
          </div>
        </div>
      )}
      <div className="row">
        <span className="label">Overlay opacity</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={a.overlay_opacity}
          onChange={(e) => set({ overlay_opacity: Number(e.target.value) })}
        />
        <span className="mono small">{a.overlay_opacity}</span>
      </div>
      <div className="row">
        <span className="label">Border radius (px)</span>
        <input
          type="number"
          min={0}
          max={32}
          value={a.border_radius}
          onChange={(e) => set({ border_radius: Number(e.target.value) })}
        />
      </div>
      <div className="row">
        <span className="label">Primary color</span>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input
            type="color"
            value={a.primary_color}
            onChange={(e) => set({ primary_color: e.target.value })}
            style={{ width: 50 }}
          />
          <input
            value={a.primary_color}
            onChange={(e) => set({ primary_color: e.target.value })}
          />
        </div>
      </div>
      <div className="row">
        <span className="label">Text color</span>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input
            type="color"
            value={a.text_color}
            onChange={(e) => set({ text_color: e.target.value })}
            style={{ width: 50 }}
          />
          <input
            value={a.text_color}
            onChange={(e) => set({ text_color: e.target.value })}
          />
        </div>
      </div>
      <div className="row">
        <span className="label">Muted color</span>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input
            type="color"
            value={a.muted_color}
            onChange={(e) => set({ muted_color: e.target.value })}
            style={{ width: 50 }}
          />
          <input
            value={a.muted_color}
            onChange={(e) => set({ muted_color: e.target.value })}
          />
        </div>
      </div>
      <div className="row">
        <span className="label">Border color</span>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input
            type="color"
            value={a.border_color}
            onChange={(e) => set({ border_color: e.target.value })}
            style={{ width: 50 }}
          />
          <input
            value={a.border_color}
            onChange={(e) => set({ border_color: e.target.value })}
          />
        </div>
      </div>
    </div>
  );
}
