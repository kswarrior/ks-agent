# React Skill — Frontend/React

Use with `frontend/skill.md` (common). This file covers **React 18** for **user websites**.

## Stack — For User Websites

- React 18 + Vite 5 (or Next.js if SSR needed), plain CSS with tokens in `src/styles.css`
- Entry `index.html` → `src/main.tsx` → `src/App.tsx` (or `src/pages/` for Next)
- Keep components in `src/components/`, hooks in `src/hooks/`, types in `src/types.ts` if needed
- Never import from `web/src`, `server/`, or internal platform code — user site is fully standalone

## Patterns — For User Sites

- **Hooks style** — `useState`, `useEffect`, `useCallback`, `useRef` with correct deps. Use `useRef` for stable callbacks when needed.
- **State wiring** — Local state in component or lifted to `App.tsx` / context. Props drilling → context if needed. Update types in `src/types.ts` when you add models.
- **Components** — Functional components only, named exports, props interface at top, files <300 LOC. `key` uses stable `id`, never index.
- **Performance** — `React.memo` only when measured; prefer `useCallback`/`useMemo` for handlers passed to children.
- **Routing** — For multi-page sites use `react-router-dom` (`BrowserRouter`, `Routes`, `Route`) or Next.js routing. Keep nav active state via `NavLink`.

## UI in React — Good Website Style

- Use token classes from `frontend/skill.md`: `btn` (secondary), `btn-primary` (blue), `input`, `card`, `overlay`, `dialog`, `dropdown`.
- Do not inline hard-coded `#000`/`#fff`; use `var(--bg)`, `var(--surface)`, `var(--border)`, `var(--text)`, `var(--primary)` so theme stays consistent.
- Primary button: exactly one `btn-primary` per view — e.g. `<button className="btn btn-primary">Get Started</button>`.
- Inputs: `className="input"` with `background:var(--input)`, `border:1px solid var(--border)`, focus `0 0 0 3px var(--primary-ring)`.
- Header/sections/cards use `var(--surface)` + `var(--border)` dividers.

## Modals & Menus — No Native Dialogs

- **Never** leave `window.confirm/alert/prompt` in generated sites. Create a local `Dialog` component:
  ```tsx
  // src/components/Dialog.tsx
  export function Dialog({ open, title, children, onClose, onConfirm }: Props) {
    if (!open) return null
    return <div className="overlay" onClick={onClose}>
      <div className="dialog" role="dialog" aria-modal="true" onClick={e=>e.stopPropagation()}>
        <h3>{title}</h3>
        {children}
        <div className="dialog-actions"><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={onConfirm}>Confirm</button></div>
      </div>
    </div>
  }
  ```
- Dropdowns/popovers: `dropdown` + `dd-item`, `menu-pop` via `createPortal` to `document.body`, close on `Escape` + outside `pointerdown` + `scroll`/`resize`.

## Checklist

- [ ] Inspected user's `src/` and `package.json` before changing
- [ ] No imports from internal platform code; site is standalone (`npm install && npm run dev` works alone)
- [ ] No `window.confirm|alert|prompt` in site code
- [ ] One primary (blue) per view; focus ring visible; responsive on 375px/768px/1200px
- [ ] No mention of `ks-agent`, `internal platform code`, `web/src`, `server/` in code or UI
- [ ] `npm run build` passes

## Preview

When the site is previewable (Vite/Next), after `npm run dev` + verify, call `open_preview` with the actual port.
