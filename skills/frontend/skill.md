# Frontend Skill — Common (KS Agent)

You are the frontend specialist for KS Agent (React 18 + Vite → `dist/`, `web/src/`). This file is the **authoritative common entry** for all frontend work — stack, design system, and mandatory workflow. Framework details live in siblings: `react.md`, `ts.md`, `ejs.md`.

## Stack (common)
- React 18, Vite 5, plain CSS only in `web/src/styles.css` (no Tailwind/Bootstrap/new framework)
- Hono backend at `server/src/index.ts` → `dist-server/` (never hand-edit `dist/`)
- State in `web/src/App.tsx`, API layer `web/src/api.ts` (`req<T>` + `streamChatEvents`), types `web/src/types.ts`, components `web/src/components/`
- Dialogs: `web/src/dialogs.tsx` (`DialogsProvider`), Toasts: `web/src/toast.tsx`
- Build: `tsc -p server/tsconfig.json && vite build` → `dist/` + `dist-server/`

## Sub-skills in this folder
- `react.md` — React 18 hooks, component patterns, memo, wiring, `open_preview`
- `ts.md` — TypeScript strict, `web/src/types.ts` ↔ server contracts, nullability
- `ejs.md` — EJS server-rendered pages/emails, escaping, React vs EJS choice
- This file (`skill.md`) — design system + workflow — always applies.

---

## 1) Design System — White Theme + Blue Primary (MANDATORY, but user-configurable via Settings → Theme)

Every new or touched UI **must** default to the white/blue modern system. Do not reintroduce the old dark `#000000` palette. The theme is **user-configurable at runtime** via Settings → Theme (presets + color pickers for primary/danger/background/radius), persisted to `GET/PATCH /api/settings/theme` and applied via `web/src/theme.ts` (`applyTheme`). Always honor the persisted theme — never hard-code colors outside tokens; new components must read from `var(--primary)`, `var(--bg)`, etc. so they react to user picks.

### Tokens — `web/src/styles.css` `:root`
```css
:root {
  --bg: #ffffff;            /* page */
  --surface: #ffffff;       /* cards, sidebar, header */
  --surface-2: #f8fafc;     /* slate-50 — hover, active rows, code bg */
  --surface-3: #f1f5f9;     /* slate-100 — subtle pressed/selected */
  --input: #ffffff;
  --border: #e2e8f0;        /* slate-200 */
  --border-strong: #cbd5e1; /* slate-300 */
  --border-2: #f1f5f9;

  --text: #0f172a;          /* slate-900 */
  --text-dim: #475569;      /* slate-600 */
  --text-faint: #94a3b8;    /* slate-400 */
  --text-on-primary: #ffffff;

  --primary: #2563eb;       /* blue-600 — PRIMARY ONLY */
  --primary-hover: #1d4ed8; /* blue-700 */
  --primary-active: #1e40af;/* blue-800 */
  --primary-bg: #eff6ff;    /* blue-50 — tint, selected rows */
  --primary-ring: rgba(37,99,235,0.18);
  --primary-border: #bfdbfe;/* blue-200 */

  --danger: #dc2626;
  --danger-bg: #fef2f2;
  --danger-border: #fecaca;
  --radius: 10px;
  --radius-sm: 8px;
  --radius-full: 999px;
  --sidebar-w: 284px;
  --header-h: 52px;
}
```

### Color usage
- **Page/surfaces**: white (`--bg`, `--surface`). Secondary surfaces use `slate-50/100` only.
- **Text**: `slate-900` primary, `slate-600` secondary, `slate-400` faint. Contrast ≥ 4.5:1.
- **Borders**: `slate-200` default, `slate-300` strong. No pure black borders.
- **Blue rule**: Blue (`--primary`) is **only** for primary CTA: `Save`, `Create`, `Send`, `Confirm`, `Continue`, `Add`, active tab underline. Exactly one primary per view/modal. Secondary buttons stay white (`--btn:#ffffff` + `--border` + `--text`); hover `slate-50`; active `slate-100`.
- **Danger**: red only for `btn-danger` + `dialog-warning` + `toast-error`. Never blue+red together as primary.

### Buttons
- `.btn` — secondary: `background: var(--btn:#fff); border:1px solid var(--border); color:var(--text);` hover `var(--btn-hover:#f8fafc)` + `border-strong`.
- `.btn-primary` — primary: `background:var(--primary); border-color:var(--primary); color:var(--text-on-primary);` hover `var(--primary-hover)`; active `var(--primary-active)`; focus ring `0 0 0 3px var(--primary-ring)`; disabled `opacity:0.45`.
- `.send-btn` — same as primary (blue circle/square). Do not make send gray.
- `.btn-danger` — `background:var(--danger-bg); border-color:var(--danger-border); color:var(--danger);`
- All buttons: `transition: background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease, color 0.15s ease`; no tap highlight (already global); `:focus-visible` uses primary ring.

### Surfaces & depth (modern)
- **No heavy dark shadows.** Use soft layered shadows:
  - Card/dropdown/modal: `0 1px 3px rgba(15,23,42,0.08), 0 4px 16px rgba(15,23,42,0.06)`
  - Popover: `0 8px 24px rgba(15,23,42,0.10)`
  - Header: `0 1px 0 var(--border)` + `0 1px 3px rgba(15,23,42,0.04)` — keep it light, not gradient-black.
- Radius: `10px` cards/modals/inputs, `8px` buttons/rows, `999px` for pills/toasts.
- Spacing: 8pt scale (4,8,12,16,24). Padding cards `14px`, rows `9px 10px`, inputs `10px 12px`.
- Typography: `ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial` — body `14.5px / 1.6`, labels `12-13px/600`, section labels `11px/600/uppercase/0.06em` in `slate-400`.
- Motion: `0.15s ease` for hover, `0.12s ease` pop (`pop` + `rise`), `0.18s ease` toast. Respect `prefers-reduced-motion`.

### Layout
- Header `52px`, white, `border-bottom:1px solid var(--border)`, no dark gradient.
- Sidebar / right panel / preview: white surfaces, `border:1px solid var(--border)`.
- Chat bubbles: user `background:var(--primary-bg); border:1px solid var(--primary-border);` or `slate-50` — not dark. Assistant seamless with `Markdown`.
- Scrollbars: `width:8px`, thumb `#cbd5e1` on white track.
- Mobile: sidebar & right panel become drawers with light scrim `rgba(15,23,42,0.32)`, same z-index scheme.

### What NOT to do
- No `#000`, `#0a0a0a`, `#1a1a1a` backgrounds. No `#ffffff` text on dark. No new CSS framework. No arbitrary colors outside tokens.

---

## 2) Zero Native Browser Dialogs — In-App UI Only (MANDATORY)

**Forbidden everywhere** in `web/src/` and in any preview/project you generate:
- `window.confirm()`, `window.alert()`, `window.prompt()`
- `window.onbeforeunload` confirm strings
- `confirm`/`alert`/`prompt` globals (no alias), `dialog.showModal()` for confirmations is also forbidden if it blocks like native confirm — use the project's `DialogsProvider`.

**Required replacements** — pick by context, all already styled in `styles.css`:

| Need | Use | Where |
|------|-----|-------|
| Delete / destructive | `useDialogs().confirm({title,message,danger,confirmText,checkboxLabel,checkboxWarning})` → `DialogsProvider` overlay (`overlay` + `dialog`) | `web/src/dialogs.tsx:68` |
| Rename / single input | `useDialogs().prompt({title,label,value,placeholder,validate})` | `web/src/dialogs.tsx:75` |
| Choose item (project/model) | Dropdown: `proj-btn` → `dropdown` / `model-chip` → `model-dd` with `search-box` + `dd-list` + `dd-item` | `Sidebar.tsx`, `ChatView.tsx` |
| Filter | Dropdown chip: `filter-chip` → `prov-pop` or `act-dropdown-btn` → `act-dropdown-menu` | `ChatView.tsx`, `ActivityPane.tsx` |
| Row actions (⋮) | Popover: `row-menu` trigger → `menu-pop menu-pop-fixed` via `createPortal` to `document.body` | `Sidebar.tsx:85`, `FilesPane.tsx` |
| Settings / form | Modal tab card: `overlay` → `modal-lg` + `tabs` + `tab-body` | `SettingsModal.tsx` |
| Files / Terminal / Plan detail | Right drawer + tabs: `rsb` + `rsb-tabs`, or inline expand `activity-detail` | `RightSidebar.tsx` |
| Preview | Right overlay: `psb` (+ `psb-scrim`) | `PreviewSidebar.tsx` |
| Light info | `useToast(msg,'success'|'error')` (`toasts` → `toast`) — toasts are dismissible, not blocking | `toast.tsx` |

**Rules**
1. Every `confirm`/`prompt` call must go through `useDialogs()`. Grep must show **zero** `window.confirm|window.alert|window.prompt` in `web/` (CI check: `grep -rn "window\.confirm\|window\.alert\|window\.prompt" web/src` → empty).
2. Modals/dropdowns/popovers must: close on `Escape`, close on outside click, trap focus initially, not use browser chrome. Follow existing patterns in `dialogs.tsx:90` (Escape handler) and `Sidebar.tsx:34` (`useClickOutside`) / `Sidebar.tsx:63` (pointerdown outside + scroll/resize dismiss).
3. For deletes with file-system impact: use `checkboxLabel` + `checkboxWarning` (see `App.tsx:497` Delete project).
4. No `confirm()` in generated project templates (EJS/React projects) — scaffold the same `DialogsProvider` or inline subpage pattern.
5. If you add a new confirmation, add it to `web/src/dialogs.tsx` surface, not a one-off `div` — keep a single a11y-correct dialog system (`role="dialog" aria-modal="true"`).

---

## 3) Modern UI Checklist (apply to every task)
- [ ] Uses white/blue tokens only; passes AA contrast; primary button is blue, one per view.
- [ ] Motion: 150ms hover, `pop`/`rise` for appear, respects reduced motion; no jank.
- [ ] Shadows soft & light; not dark glows.
- [ ] No native `confirm/alert/prompt`; grep clean; all confirmations are in-app.
- [ ] Responsive: drawer on `<900px` (sidebar) and `<1200px` (workspace/preview); composer safe-area.
- [ ] A11y: `aria-label` on icon buttons, `role="dialog"` on modals, keyboard Esc + Enter, focus ring visible (primary ring).
- [ ] Empty states styled (`empty`, `dd-empty`) — never blank screen.

---

## 4) Workflow (common)
1. **Inspect first** — `read` on `web/src/` before changing. Check duplicate types between `web/src/types.ts` and server responses.
2. **Wire all layers** — route → store → `api.ts` → component → verify end-to-end via Checklist V (`loop.md`).
3. **Conventions** — hooks style (`useState/useEffect/useCallback/useRef` as in `App.tsx`), functional components, named exports, `<300 LOC` per file, stable `id` keys.
4. **No build artifacts** — never hand-edit `dist/` or `dist-server/`; `npm run build` after.
5. **Verify** — `npm run typecheck` (web+server), `npm run build`, then `bash retest.sh` + `curl` + manual UI check (desktop + phone). Preview tasks: `open_preview` → `PreviewSidebar`.

## When to Use
User asks for UI, component, style, theme, or preview work. Always check `vite.config.ts` + `tsconfig.json`. For React specifics read `react.md`; for contract work `ts.md`; for EJS `ejs.md`.
