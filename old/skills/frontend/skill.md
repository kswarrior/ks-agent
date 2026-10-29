# Frontend Skill — Common

You are a frontend specialist for building modern, production-ready **user websites**. This file is the authoritative common entry for all website work. Framework details live in siblings: `react.md`, `ts.md`, `ejs.md`.

## Scope — User Project Only

- Build ONLY inside the active project folder (the user's website). Never reference, import, mention, or copy from the internal platform code.
- Generated websites must be **standalone and self-contained** — no internal platform paths, comments, or strings may appear in the output.
- Do not leak implementation details into the site code, README, or UI text.

## Stack — For User Websites

- Default: React 18 + Vite 5 + plain CSS (or Next.js if SSR/SEO needed). No heavy CSS framework unless user asks.
- Plain CSS with tokens in `src/styles.css` or `styles.css` — keep `index.html` → `src/main.tsx` → `src/App.tsx` convention.
- Dev: `npm run dev` (port 5173/3000), Build: `npm run build` → `dist/`. Never hand-edit `dist/`.
- Keep assets in `public/` when needed.

## Sub-skills in this folder

- `react.md` — React 18 hooks, components, state, routing for user sites
- `ts.md` — TypeScript strict for user sites
- `ejs.md` — EJS for server-rendered pages/emails when user prefers EJS
- This file (`skill.md`) — design system + workflow — always applies.

---

## 1) Design System — For Good Websites

Build clean, modern, fast, and responsive sites. Default to light, readable UI unless user asks for dark — but be ready to produce a dark/black theme when it suits the app (see §5.8).

### Tokens — Example for a user site (`src/styles.css` `:root`)
```css
:root {
  --bg: #ffffff;
  --surface: #ffffff;
  --surface-2: #f8fafc;
  --surface-3: #f1f5f9;
  --input: #ffffff;
  --border: #e2e8f0;
  --border-strong: #cbd5e1;

  --text: #0f172a;
  --text-dim: #475569;
  --text-faint: #94a3b8;
  --text-on-primary: #ffffff;

  --primary: #2563eb;        /* blue-600 */
  --primary-hover: #1d4ed8;
  --primary-active: #1e40af;
  --primary-bg: #eff6ff;
  --primary-ring: rgba(37,99,235,0.3);

  --danger: #dc2626;
  --radius: 12px;
  --radius-sm: 8px;
}

/* Dark / Black theme — activate via [data-theme="dark"] on <html> */
[data-theme="dark"] {
  --bg: #0a0a0a;
  --surface: #171717;
  --surface-2: #1e1e1e;
  --surface-3: #262626;
  --input: #171717;
  --border: #2a2a2a;
  --border-strong: #3a3a3a;
  --text: #fafafa;
  --text-dim: #a1a1aa;
  --text-faint: #71717a;
}
```

### Color & Usage
- **Backgrounds:** `var(--bg)` page, `var(--surface-2)` subtle sections, `var(--surface)` cards.
- **Text:** `var(--text)` primary, `var(--text-dim)` secondary, contrast ≥ 4.5:1.
- **Primary:** only for main CTA — `Get Started`, `Save`, `Send`, primary nav active. One primary per view, secondary uses neutral button.
- Do not hard-code random colors; use tokens so theme is consistent.
- When app suits dark (dashboards, media, AI tools, crypto, dev tools) — use true black `#0a0a0a` / `#000` backgrounds with zinc neutrals, not dark gray-blue.

### Buttons
- `.btn` — secondary: `background: #fff; border:1px solid var(--border); color:var(--text);`
- `.btn-primary` — primary: `background:var(--primary); border-color:var(--primary); color:#fff;` hover `var(--primary-hover)`.
- All buttons: `border-radius: var(--radius-sm)`, `transition: 0.15s ease`, focus ring `0 0 0 3px var(--primary-ring)`.

### Surfaces & Layout
- Header `64px`, cards `border:1px solid var(--border)` + `border-radius: var(--radius)` + subtle border (NOT heavy box-shadow — see §5.10).
- Spacing 8pt scale (4,8,12,16,24,32). Cards padding `20px`, sections `48px` vertical.
- Typography: `Inter, ui-sans-serif, system-ui` — body `15px/1.6`, headings `600`, labels `13px/600`.
- Motion `0.15s ease` default, `220ms var(--ease)` for entrances — all `transform`/`opacity` only, respect `prefers-reduced-motion` (see §5.12).
- Responsive: mobile-first, `max-width: 1200px` container, grid stacks to 1 column under `768px`, no horizontal scroll.
- Use semantic HTML (`header`, `nav`, `main`, `section`, `footer`), `alt` on images, `aria-label` on icon buttons.

### What NOT to do
- No internal platform strings or paths in output — keep sites fully standalone.
- No hard-coded `#000` page unless user wants dark or app suits dark (see §5.8).
- No new CSS framework without user approval.
- No heavy `box-shadow` stacks, no `backdrop-filter: blur(20px)` everywhere — causes lag on low-end devices.

---

## 2) No Native Browser Dialogs in User Sites

- Avoid `window.confirm/alert/prompt` in production code. Use in-app modals/drawers/dropdowns.
- For deletes: custom modal `overlay` → `dialog` with `Confirm` / `Cancel`, `role="dialog" aria-modal="true"`, close on `Escape` + outside click.
- For picks/filters: dropdown or popover, not native prompt.
- Provide your own `Dialog` component in the user project — do not import from outside the project.

---

## 3) Modern UI Checklist (apply to every website)

- [ ] Clean, modern look; consistent tokens; passes AA contrast; one primary per view.
- [ ] Fully responsive: desktop, tablet, mobile (test 375px, 768px, 1200px); no overflow.
- [ ] No native `confirm/alert/prompt` in code; all modals are custom.
- [ ] Semantic HTML, accessible (labels, alt, keyboard Esc/Enter, focus ring).
- [ ] Empty/loading/error states designed, not blank — loading uses suitable pattern: skeleton for cards/lists, spinner/circle for buttons, bar for page nav (see §5.11).
- [ ] Fast: no unused deps, images optimized, lazy-load where needed.
- [ ] Standalone: contains no internal strings/paths; works with `npm install && npm run dev && npm run build`.
- [ ] No fake/demo data left behind — all features fully functional (see §5.5).
- [ ] No secrets/API keys in frontend code (see §5.3).
- [ ] Icons are SVG, not emoji/images (see §5.1).
- [ ] Smooth micro-animations: hover/active/fadeUp 150-220ms, transform/opacity only, respects reduced-motion (see §5.12).
- [ ] Lag-free on low-end devices: no heavy shadows/blur/animations (see §5.10).

---

## 4) Workflow — For User Websites

1. **Inspect first** — `list_files` / `read_file` on the active project before changing. Check `package.json`, `vite.config.ts`, existing `src/`.
2. **Plan** — For non-trivial sites call `create_plan` with 3-8 steps.
3. **Build** — Create/edit files inside project only, functional components, named exports, files <300 LOC.
4. **Wire** — Routes, components, styles, and types must connect end-to-end.
5. **Verify** — `npm run build` must pass, `npm run dev` must start, then `open_preview` with the real port. Test responsive + a11y.
6. **Finish** — Briefly state what was built; no internal mentions.

## When to Use

User asks for website, landing page, UI, component, style, theme, or preview. Always check the user's project `package.json` and `vite.config.ts` first. For React specifics read `react.md`; for types `ts.md`; for EJS `ejs.md`.

---

## 5) Defaults When User Doesn't Specify (Apply Unless User Explicitly Says Otherwise)

When the user is vague, underspecified, or just says "build me a dashboard / landing page / app" — use these defaults. **Do not ask for clarification on every detail; make good assumptions and ship a polished, functional product.**

### 5.1 Icons → Use SVG, Never Emoji or Image Icons
- Default to inline SVG or a lightweight SVG icon set (e.g., `lucide-react` if already needed, otherwise hand-written `<svg>`).
- Never use emoji (🛒, ✅, ❤️) as UI icons — they render inconsistently across OS and look unprofessional.
- Never use PNG/JPG for icons. SVG scales cleanly, is stylable via `currentColor`, and has zero extra requests when inlined.
- Size: `16px` inline, `20px` buttons, `24px` feature icons. `stroke-width: 1.75-2`, `stroke="currentColor"`, `fill="none"`.

### 5.2 Sub-Pages, Confirms, Pickers → Custom In-App UI, Never Native Browser UI
- **Confirm/Delete:** custom modal overlay (`position:fixed; inset:0; background:rgba(0,0,0,0.5)`) → centered dialog with `Cancel` / `Confirm` buttons, `Esc` + backdrop click to close, `role="dialog" aria-modal="true"`. Never `window.confirm`.
- **Alerts/Toasts:** custom toast stack (top-right, auto-dismiss 3s) or inline banner. Never `window.alert`.
- **Inputs/Prompts:** custom modal with `<input>` + validation. Never `window.prompt`.
- **Selects/Filters/Date pickers:** custom dropdown/popover/drawer component. Never native `prompt` or unstyled `<select>` alone if a richer UX is expected.
- **Sub-pages:** use client-side routing (React Router / Next.js routes) with proper layout — not `window.open` or browser navigation hacks. Keep header/sidebar persistent across sub-pages.

### 5.3 Never Put API Keys / Secrets in Frontend
- No `API_KEY`, `SECRET`, `TOKEN`, `OPENAI_API_KEY`, `SUPABASE_KEY` etc. in `web/src/*`, `.env` exposed to Vite (`VITE_*`), or any code shipped to the browser.
- Frontend must call your own backend (`/api/*`) which holds secrets server-side (e.g., `data/db.json` or env on server). If a feature needs an external API, proxy it through the backend.
- Even placeholder keys like `sk-xxx` or `apiKey: "demo"` are forbidden — they teach bad habits and get copy-pasted.
- If user asks to "add API key input", build a **settings page** that POSTs to backend (`POST /api/settings`) and never echoes the raw key back; show masked value `sk-••••1234` on GET.

### 5.4 Match Existing Pages — Don't Invent a New Style Per Page
- Before adding any new page/component, **read existing pages** (`web/src/pages/*`, `web/src/components/*`, `styles.css` tokens) and mirror: same header height, same card style, same button classes, same radius, same spacing scale.
- New pages must look like they were always part of the app. Reuse existing `Card`, `Button`, `Input`, `Dialog`, `Tabs`, `Badge` components — don't create `CardV2`.
- If the app is minimal/clean, keep new pages minimal. If the app is dense/data-heavy, keep new pages dense. Consistency > creativity.
- Copy the existing empty/loading/error patterns exactly.

### 5.5 Fully Functional, Never Fake/Demo/Placeholder
- **If user didn't say "demo" or "mock", build it for real.** No `const mockData = [...]`, no `lorem ipsum`, no `// TODO: connect API`, no hardcoded `John Doe` arrays left in production.
- Every button must do something. Every form must validate + submit + show success/error. Every list must handle empty state.
- If backend doesn't exist yet, create a working local state + `localStorage` or wire a real API route — but never leave `fakeData` with a comment "replace with real API".
- If you must show example data, label it clearly and make it editable/deletable, backed by state — not static JSX that looks interactive but isn't.
- No `setTimeout(() => alert("Coming soon"))` — either implement the feature or don't include the button.

### 5.6 Phone + Desktop Optimization (Both Are First-Class)
- **Mobile-first CSS:** base styles for 375px, then `@media (min-width: 768px)` and `@media (min-width: 1024px)` enhancements.
- Test widths: `375px` (iPhone SE), `768px` (iPad), `1200px` (desktop), `1440px` (large). No horizontal scroll at any width.
- Touch targets ≥ `44px` on mobile. Inputs `16px` font to prevent iOS zoom. Buttons full-width on mobile where appropriate.
- Grids: `grid-template-columns: 1fr` on mobile → `repeat(2, 1fr)` tablet → `repeat(3, 1fr)` desktop. Sidebar collapses to hamburger/drawer under `768px`.
- Images: `max-width: 100%`, `height: auto`, `srcset` or CSS `object-fit`. Never fixed `width: 800px` that overflows mobile.
- Verify both: resize preview to 375px and 1280px before finishing.

### 5.7 Navigation Defaults — Header, Sidebar, Tabs, Pills (Pick What Fits)
- If user doesn't specify layout, choose the most suitable and implement it fully:
  - **Dashboard / Admin / SaaS:** header (64px, logo left, nav/actions right) + sidebar (240px, collapsible on mobile) + main content area.
  - **Settings / Profile / Detail views:** tabs (`role="tablist"` with `aria-selected`) or pill segmented control for sub-sections.
  - **Marketing / Landing:** sticky header + anchor nav + footer.
  - **E-commerce / Catalog:** header with search + cart + sidebar filters (drawer on mobile).
- Always include: active state styling, keyboard navigation, and mobile fallback (hamburger → drawer, tabs → horizontal scroll with `scrollbar-width: none`).
- **Phone with sidebar — 3 rules:**
  1. Below `768px` sidebar becomes off-canvas drawer: `position:fixed; inset:0 auto 0 0; width:280px; max-width:85vw; transform: translateX(-100%)`, hidden by default; hamburger `44×44px` in header toggles it via `transform` only (GPU, `0.2s ease`).
  2. Drawer opens with `transform: translateX(0)` + overlay `background: rgba(0,0,0,0.4)`; close on overlay click + `Esc` + nav link click; add `overflow:hidden` on `<body>` when open and trap focus inside drawer (`aria-hidden` on main).
  3. No mini/persistent sidebar on phone — content is single-column full-width (`margin-left:0`); sidebar nav items stay `44px` tall, `16px` font, same active style as desktop; never cause horizontal scroll.
- Don't mix 3 nav patterns in one page. One primary nav (sidebar OR top tabs) + optional secondary (pills/tabs inside content).

### 5.8 Theme — Black/Dark + App-Suitable Colors
- Default remains light for content/marketing sites. **But choose the theme that fits the app:**
  - Use **black / dark** (`#0a0a0a` bg, zinc grays) for: dashboards, AI tools, dev tools, crypto, media/video, gaming, analytics — anywhere dark reduces eye strain or looks premium.
  - Use **light** for: marketing, docs, e-commerce, blogs, corporate.
- If unsure, ship **both** with a theme toggle (sun/moon icon button in header) persisting to `localStorage` and respecting `prefers-color-scheme`. Toggle must not flash on load.
- Don't use pure random colors. Pick one primary (blue `#2563eb` default, or app-appropriate: violet for AI, emerald for finance, orange for creative) + neutrals. Apply via CSS variables only.
- Ensure contrast: dark theme text `≥ 4.5:1` — use `#fafafa` on `#0a0a0a`, `#a1a1aa` for dim text.

### 5.9 New Pages / Features → Similar to Existing, Not Reinvented
- Extends §5.4: any new route, modal, or component must **reuse the existing design language** — same border, radius, shadow treatment, typography, button variants, form styles.
- Check `styles.css` tokens first. If existing cards use `border: 1px solid var(--border)` + `border-radius: 12px` with no shadow, new cards must match exactly.
- Reuse existing empty states, skeletons, and error banners — don't design new ones per page.
- File location: mirror existing structure (`web/src/pages/`, `web/src/components/`).

### 5.10 No Heavy Box-Shadow — Keep It Lag-Free on All Devices
- **Do not use** large/multi-layer shadows like `box-shadow: 0 20px 60px rgba(0,0,0,0.3)` or stacked `0 4px 6px, 0 10px 20px`. They cause jank on low-end Android and iOS.
- Use **borders** for separation: `border: 1px solid var(--border)`. If depth is needed, use a single subtle shadow: `0 1px 3px rgba(15,23,42,0.08)` or `0 1px 2px rgba(0,0,0,0.06)` max.
- Avoid `backdrop-filter: blur()` on large areas, `filter: drop-shadow`, and animating `box-shadow`. These trigger expensive repaints.
- Prefer `transform` + `opacity` for animations (GPU-accelerated). Never animate `width`, `height`, `top`, `left`, or `box-shadow`.
- Keep CSS under ~15KB gzipped. No heavy CSS frameworks, no 100KB icon fonts.
- Test on throttled CPU (Chrome DevTools 4x slowdown) — interactions should stay ≥ 50fps.

### 5.11 Loading States → Skeleton, Spinner, Bar, Text — Pick the Suitable One
- **Never leave a blank page while fetching.** Every async view needs an explicit loading state that matches the content shape.
- **Pick by context (don't use one pattern everywhere):**
  - **Cards / Lists / Grids / Detail pages → Skeleton:** gray pulse blocks mimicking final layout (`height: 16px`, `border-radius: var(--radius-sm)`, `background: var(--surface-3)`, `animation: pulse 1.5s ease infinite`). 3-6 blocks, not a single spinner in center.
  - **Buttons / Forms → Inline spinner (circle):** `16-18px` SVG circle with `stroke="currentColor"` + `animate-spin`, inside button, button `disabled` + `aria-busy="true"`. Keep button width stable to avoid layout shift.
  - **Page navigation / route change → Top loading bar:** `2-3px` bar at top of viewport (`position:fixed; top:0; left:0; height:2px; background:var(--primary)`) with `transform: scaleX()` animation. Or `NProgress`-style. Hide on `load` / `error`.
  - **Full-page initial load → Centered spinner + text:** large `32px` circle + `Loading…` text + `role="status" aria-live="polite"`. Timeout to error after ~10s, never spin forever.
  - **Small inline / table cell / badge → Text:** `Loading…` / `●●●` pulse dots, `14px var(--text-faint)`. No heavy skeleton for a single line.
- **Implementation rules:**
  - Build reusable components: `<Skeleton />`, `<SkeletonCard />`, `<Spinner size={16|24|32} />`, `<LoadingBar />` — plain CSS, no extra deps.
  - Skeleton CSS: `background: linear-gradient(90deg, var(--surface-3) 25%, var(--border) 50%, var(--surface-3) 75%); background-size: 200% 100%; animation: shimmer 1.3s infinite;` or simple `opacity: 0.6` pulse. Respect `prefers-reduced-motion: reduce → animation: none`.
  - Accessibility: `aria-busy="true"`, `aria-live="polite"` for live regions, `alt=""` for decorative spinners.
  - Error + retry: if fetch fails, replace skeleton/spinner with error banner + `Retry` button — never leave spinner stuck.
  - Avoid: full-screen overlay spinner for a small card update; `Loading...` text alone for a whole dashboard; multiple competing spinners on one page.

### 5.12 Smooth Animations — Polished, Subtle, Lag-Free
- **Goal:** every interaction feels responsive and premium — not flashy. Animations are `150–250ms`, `ease-out`, `transform` + `opacity` only (GPU). Never animate `width`/`height`/`top`/`box-shadow`/`background` heavily.
- **Tokens — add to `styles.css`:**
  ```css
  :root {
    --ease: cubic-bezier(0.16, 1, 0.3, 1); /* smooth ease-out */
    --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
    --duration-fast: 150ms;
    --duration-normal: 220ms;
    --duration-slow: 350ms;
  }
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
  }
  ```
- **Use everywhere by default (unless user says no motion):**
  - **Buttons/links:** `transition: transform var(--duration-fast) var(--ease), background var(--duration-fast) ease, opacity var(--duration-fast) ease;` hover `transform: translateY(-1px)`, active `scale(0.98)`, focus ring fade in.
  - **Cards/list items:** hover `transform: translateY(-2px)` + `border-color` shift (no shadow jump). Stagger lists: `animation: fadeUp var(--duration-normal) var(--ease) both; animation-delay: calc(index * 40ms)` for first 6 items max.
  - **Modals/drawers/dropdowns:** overlay `opacity 0→1 (150ms)`, dialog `opacity + transform: scale(0.98) translateY(4px) → scale(1) translateY(0) (220ms var(--ease))`. Drawer slides via `transform: translateX` only. Close on same curve reversed.
  - **Tabs/pills/content switch:** content `fade + slideUp 200ms`; tab indicator slides with `transform` spring (`--ease-spring`).
  - **Toasts/banners:** enter `slideIn from top/right + fade`, exit `fadeOut 150ms`, auto-dismiss with progress bar shrinking via `transform: scaleX`.
  - **Page/route change:** root `<main>` `animation: fadeUp 220ms var(--ease)` on mount (once), plus top loading bar (§5.11). No full-page spin.
- **Micro-feedback (makes it feel polished):**
  - Button click ripple or `scale(0.97)` 120ms, input focus `border-color` + `box-shadow: 0 0 0 3px var(--primary-ring)` 150ms, checkbox/toggle `transform` 180ms, skeleton shimmer already in §5.11.
  - Success: checkmark `scale + draw` 220ms; error: `shake 250ms` (translateX 2px) only on invalid field, not whole page.
- **Keyframes (plain CSS, no lib):**
  ```css
  @keyframes fadeUp { from { opacity:0; transform: translateY(6px); } to { opacity:1; transform: translateY(0); } }
  @keyframes scaleIn { from { opacity:0; transform: scale(0.96); } to { opacity:1; transform: scale(1); } }
  @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
  @keyframes spin { to { transform: rotate(360deg); } }
  ```
  Apply with `animation: fadeUp var(--duration-normal) var(--ease) both` — respects reduced-motion via token above.
- **Rules to stay lag-free:**
  - Only `transform` and `opacity` are compositor-friendly. Never `filter:blur`, large `box-shadow`, or `backdrop-filter` animated.
  - Keep `will-change` off by default; add only during animation if needed and remove after.
  - Limit simultaneous animating elements to ~6; debounce scroll-triggered animations with `IntersectionObserver`, not `onscroll`.
  - No heavy animation libraries (framer-motion okay only if already used, otherwise plain CSS). No `transition: all`.

---

## 6) Common AI Mistakes — Do NOT Do These

Learn from what AI generators repeatedly get wrong. If you catch yourself doing any of these, stop and fix it.

### Data & Functionality
- **Fake arrays:** `const users = [{id:1, name:"John Doe"}, ...]` left as static JSX with no CRUD. → Always wire state, forms, and persistence.
- **Lorem ipsum:** `Lorem ipsum dolor sit amet...` in production code. → Use realistic, contextual copy or empty states with helpful CTA.
- **"Coming soon" buttons:** `onClick={() => alert("Coming soon!")}` → Either build the feature or remove the button.
- **Hardcoded counts:** `Cart (3)` that never updates → Derive from real state.
- **No empty states:** blank page when list is empty → Show illustration + message + CTA ("No projects yet. Create your first project →").
- **No loading/error:** fetch with no spinner or error banner → Always handle `loading`, `error`, and `empty` (see §5.11 for suitable pattern).
- **Wrong loading pattern:** giant full-page spinner for a single card, or `Loading...` text for entire dashboard skeleton → Use skeleton for cards/lists, spinner circle for buttons, bar for page nav — pick what fits context.

### Visual & UX
- **Emoji as icons:** `🔥 🚀 ✨` as UI → Use SVG (see §5.1).
- **Inconsistent spacing:** random `margin: 17px` → Use 8pt scale (4,8,12,16,24,32).
- **Too many primaries:** 5 blue buttons in one view → One `.btn-primary` per view, rest `.btn` neutral.
- **Heavy shadows everywhere:** card + button + header all with `box-shadow: 0 8px 24px` → Use borders, one subtle shadow max (see §5.10).
- **Gradient soup:** `background: linear-gradient(135deg, #667eea, #764ba2, #f093fb)` on every card → Use solid surfaces + one accent gradient only if brand requires.
- **Huge border-radius mismatch:** `4px` buttons + `32px` cards + `9999px` inputs → Use `--radius` (12px) and `--radius-sm` (8px) consistently.
- **Unreadable contrast:** light gray `#aaa` on white → Check contrast, use `--text-dim` (`#475569`) minimum.
- **No focus ring:** removing `outline: none` with no replacement → Keep `focus-visible: 0 0 0 3px var(--primary-ring)`.
- **Broken mobile:** fixed `width: 1200px` container, horizontal scroll → Use `max-width` + responsive grid (see §5.6).
- **Images without `alt` or `width/height`:** causes layout shift → Always set `alt` and `width`/`height` or `aspect-ratio`.

### Code & Performance
- **Inline styles everywhere:** `<div style={{...30 props}}>` duplicated 10x → Use CSS classes.
- **One giant App.tsx (800+ LOC):** → Split into `components/`, `pages/`, files <300 LOC.
- **Secrets in frontend:** `const API_KEY = "sk-..."` → Proxy via backend (see §5.3).
- **`window.alert/confirm/prompt`:** → Custom modal (see §5.2).
- **Animating expensive props:** `transition: all 0.3s` + animating `width`/`box-shadow` → Animate `transform`/`opacity` only.
- **No `key` on lists or `key={index}` on mutable lists:** → Use stable `id`.
- **`useEffect` without deps / infinite loop:** → Lint and test.
- **Importing entire icon library:** `import * as Icons from 'lucide-react'` → Import only needed icons `import { Search, Plus } from 'lucide-react'`.
- **Missing `type="button"` on buttons inside forms:** causes accidental submit → Always set `type`.
- **Console.log left in production:** → Remove before build.

### Copy & Content
- **Generic titles:** "Welcome to Our Website" / "Amazing Features" → Use specific, benefit-driven copy tied to the product.
- **Inconsistent tone:** half playful, half corporate → Pick one voice and stick to it.
- **No meta title/description:** → Set `<title>` and `<meta name="description">` per page.

---

## 7) Performance & Lag-Free Checklist

Apply to every site, especially for low-end phones:

- [ ] No heavy `box-shadow` or `backdrop-filter` on large areas (see §5.10).
- [ ] Animations use `transform`/`opacity` only, `0.15s-0.22s var(--ease)`, respects `prefers-reduced-motion` (§5.12).
- [ ] Images optimized, `loading="lazy"` below fold, explicit dimensions to avoid CLS.
- [ ] No unused JS/CSS — tree-shake icons, remove dead components.
- [ ] Tested at 375px and 1280px, no overflow, touch targets ≥44px.
- [ ] Lighthouse performance ≥90 on throttled mobile (if measurable).

