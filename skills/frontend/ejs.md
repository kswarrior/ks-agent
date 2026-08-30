# EJS Skill — Frontend/EJS

Use with `frontend/skill.md` (common). KS Agent's UI is React 18, but EJS is supported for **server-rendered pages, email templates, or legacy views** inside a project (`project/<name>/views/`).

## When to Use EJS vs React
- **React + Vite** (default): SPA, `web/src/`, `PreviewSidebar`, `open_preview` — use for KS Agent itself and modern frontends.
- **EJS**: `*.ejs` files rendered by the project's own server (Express/Hono `res.render`, `ejs.renderFile`), emails, or when the project already uses EJS.

## Syntax
```ejs
<% /* logic */ if (user) { %>
  <h1><%= user.name %></h1>  <% /* escaped */ %>
  <div><%- html %></div>      <% /* unescaped */ %>
  <%- include('partials/head', {title}) %>
<% } %>
```
- `<%= %>` escapes HTML, `<%- %>` does not — **always escape user input**
- `include` path is relative to `views/`; pass data as second arg
- Loops: `<% items.forEach(i => { %><li><%= i %></li><% }) %>`

## Conventions for KS Agent Projects
1. **Locate** — `list_files` project `views/` before changing. Keep `views/`, `views/partials/`, `public/` as project has.
2. **Escaping** — Default to `<%= %>`; only use `<%- %>` for trusted HTML.
3. **No logic in template** — Keep logic in route/controller; template only loops/conditionals/escaping.
4. **Static assets** — `public/styles.css` (plain CSS, no new framework unless user asks).
5. **Verify** — For EJS, run project's own dev server (`npm run dev` in `project/<name>`) and `open_preview` → check via `PreviewSidebar`; also `npm run build` if project has one.

## Example
Write `project/demo/views/index.ejs` and `project/demo/server.js` with `app.set('view engine','ejs')`, then `open_preview` on its port.

## Checklist
- [ ] Inspected `project/<name>/views/` and `package.json` (is `ejs` in deps?)
- [ ] Escaped all user data, used `include` for partials
- [ ] Followed project's existing EJS style, no React deps added for EJS task
