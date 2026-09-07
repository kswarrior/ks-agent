# React Skill — Frontend/React

Use with `frontend/skill.md` (common). This file covers **React 18** for **user websites**.

## Stack — For User Websites

- React 18 + Vite 5 (or Next.js if SSR needed), plain CSS with tokens in `src/styles.css`
- Entry `index.html` → `src/main.tsx` → `src/App.tsx` (or `src/pages/` for Next)
- Keep components in `src/components/`, hooks in `src/hooks/`, types in `src/types.ts` if needed
- Never import from outside the project — user site is fully standalone with its own `src/`

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

- **Never** leave `window.confirm/alert/promp