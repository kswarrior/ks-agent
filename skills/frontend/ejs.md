# EJS Skill — Frontend/EJS

Use with `frontend/skill.md` (common). For **user websites** that need server-rendered pages, email templates, or legacy views.

## When to Use EJS vs React — For User Sites

- **React + Vite** (default): SPA for modern user websites — `index.html` → `src/main.tsx` → `src/App.tsx`, preview via `open_preview`
- **EJS**: `*.ejs` files rendered by the user's own server (`Express`/`Hono` `res.render`, `ejs.renderFile`), emails, or when the user's project already uses EJS

Never mix agent paths — choose one stack for the user project and keep it standalone.

## Syntax

```ejs
<% /* logic */ if (user) { %>
  <h1><%= user.name %></h1>  <% /* escaped */ %>
  <div><%- html %></div>      <% /* unescaped — only trusted HTML */ %>
  <%- include('partials/head', {title}) %>
<% } %>
```
- `<%= %>` escapes HTML, `<%- %>` does not — **always escape user input**
- `include` path is relative to `views/`; pass data as second arg
- Loops: `<% items.forEach(i => { %><li><%= i %></li><% }) %>`

## Conventions — For User Websites

1. **Locate** — `list_files` on user's project `views/` before changing. Keep `views/`, `views/partials/`, `public/` as the user has it.
2. **Escaping** — Default to `<%= %>`; only use `<%- %>` for trusted HTML.
3. **No logic in template** — Keep logic in route/controller; template only does loops/conditionals/escaping.
4. **Static assets** — `public/styles.css` (plain CSS with tokens, no new framework unless user asks).
5. **Standalone** — Generated EJS site must not contain `ks-agent`, `internal platform code`, `web/src`, `server/src`, or any agent path/comment. It must run with `npm install && npm run dev` alone.
6. **Verify** — Run user's own dev server (`npm run dev` in the project) and `open_preview` on its port; also `npm run build` if project has one.

## Example — Standalone User Project

Create `views/index.ejs` and `server.js` inside the active project:
```js
// server.js
import express from 'express'
const app = express()
app.set('view engine','ejs')
app.set('views','./views')
app.get('/', (req,res) => res.render('index', { title: 'My Site' }))
app.listen(3000, () => console.log('http://localhost:3000'))
```
Then `npm run dev` → `open_preview` on `3000`.

## Checklist

- [ ] Inspected user's `views/` and `package.json` (is `ejs` in deps?)
- [ ] Escaped all user data, used `include` for partials
- [ ] No internal platform code strings or paths in output
- [ ] Followed user's existing EJS style, no React deps added for EJS task
- [ ] Verified via `npm run dev` + `open_preview`
