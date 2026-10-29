import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { serve, ok, fail, run, formatRun } from '../sdk.mjs'

const STATE = '.ks-web-dev.json'
const LOG = '.ks-web-dev.log'

function safeJoin(root, rel = '.') {
  const abs = path.resolve(root, rel || '.')
  if (abs !== root && !abs.startsWith(root + path.sep)) throw new Error(`path escapes project: ${rel}`)
  return abs
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function writeFile(root, rel, content) {
  const abs = safeJoin(root, rel)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  fs.writeFileSync(abs, content, 'utf8')
}

function appName(value, fallback) {
  const name = typeof value === 'string' && value.trim() ? value.trim() : fallback
  return name.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'web-app'
}

function appRoot(project, args) {
  return safeJoin(project, typeof args.path === 'string' ? args.path : '.')
}

function requireApp(root) {
  const packagePath = path.join(root, 'package.json')
  if (!fs.existsSync(packagePath)) throw new Error('package.json not found; run scaffold first')
  return packagePath
}

function runningPid(root) {
  const statePath = path.join(root, STATE)
  if (!fs.existsSync(statePath)) return null
  try {
    const state = readJson(statePath)
    if (!state.pid) return null
    process.kill(state.pid, 0)
    return state
  } catch {
    return null
  }
}

function tail(file, lines = 40) {
  if (!fs.existsSync(file)) return ''
  const content = fs.readFileSync(file, 'utf8')
  return content.split('\n').slice(-lines).join('\n')
}

serve({
  async call(name, args, params) {
    const project = path.resolve(params.projectPath ?? '')
    if (!fs.existsSync(project)) return fail(`project not found: ${project}`)

    if (name === 'scaffold') {
      const root = appRoot(project, args)
      const packagePath = path.join(root, 'package.json')
      if (fs.existsSync(packagePath) && args.force !== true) {
        return fail(`package.json already exists in ${root}; pass force:true to overwrite`)
      }
      const pkgName = appName(args.name, path.basename(project))
      fs.mkdirSync(path.join(root, 'src'), { recursive: true })
      writeFile(
        root,
        'package.json',
        JSON.stringify(
          {
            name: pkgName,
            private: true,
            version: '0.1.0',
            type: 'module',
            scripts: { dev: 'vite', build: 'tsc --noEmit && vite build', preview: 'vite preview', test: 'vitest run' },
            dependencies: { react: '^18.3.1', 'react-dom': '^18.3.1' },
            devDependencies: {
              '@types/react': '^18.3.12',
              '@types/react-dom': '^18.3.1',
              '@vitejs/plugin-react': '^4.3.3',
              typescript: '^5.6.3',
              vite: '^5.4.11',
              vitest: '^2.1.8'
            }
          },
          null,
          2
        ) + '\n'
      )
      writeFile(
        root,
        'index.html',
        `<!doctype html>\n<html lang="en">\n  <head>\n    <meta charset="UTF-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n    <title>${pkgName}</title>\n  </head>\n  <body>\n    <div id="root"></div>\n    <script type="module" src="/src/main.tsx"></script>\n  </body>\n</html>\n`
      )
      writeFile(
        root,
        'vite.config.ts',
        `import { defineConfig } from 'vite'\nimport react from '@vitejs/plugin-react'\n\nexport default defineConfig({ plugins: [react()] })\n`
      )
      writeFile(
        root,
        'tsconfig.json',
        JSON.stringify(
          {
            compilerOptions: {
              target: 'ES2022',
              lib: ['ES2022', 'DOM', 'DOM.Iterable'],
              module: 'ESNext',
              moduleResolution: 'Bundler',
              jsx: 'react-jsx',
              strict: true,
              skipLibCheck: true,
              noEmit: true,
              types: ['vite/client']
            },
            include: ['src']
          },
          null,
          2
        ) + '\n'
      )
      writeFile(
        root,
        'src/main.tsx',
        `import React from 'react'\nimport ReactDOM from 'react-dom/client'\nimport App from './App'\nimport './styles.css'\n\nReactDOM.createRoot(document.getElementById('root')!).render(\n  <React.StrictMode>\n    <App />\n  </React.StrictMode>\n)\n`
      )
      writeFile(
        root,
        'src/App.tsx',
        `import { useState } from 'react'\n\nexport default function App() {\n  const [count, setCount] = useState(0)\n  return (\n    <main className="app">\n      <h1>${pkgName}</h1>\n      <p>Vite + React + TypeScript, scaffolded by KS Agent.</p>\n      <button onClick={() => setCount((value) => value + 1)}>count is {count}</button>\n    </main>\n  )\n}\n`
      )
      writeFile(
        root,
        'src/styles.css',
        `:root { color-scheme: dark; font-family: system-ui, sans-serif; }\nbody { margin: 0; background: #000; color: #eee; }\n.app { min-height: 100vh; display: grid; place-content: center; gap: 1rem; text-align: center; }\nbutton { padding: 0.6rem 1rem; border-radius: 8px; border: 1px solid #333; background: #111; color: #eee; cursor: pointer; }\n`
      )
      return ok(`Scaffolded ${pkgName} in ${path.relative(project, root) || '.'}\nNext: ext_web_install, then ext_web_build or ext_web_start.`)
    }

    if (name === 'install') {
      const root = appRoot(project, args)
      requireApp(root)
      const result = await run('npm', ['install'], { cwd: root, timeoutMs: 900_000 })
      return result.code === 0 ? ok(formatRun(result)) : fail(formatRun(result))
    }

    if (name === 'build') {
      const root = appRoot(project, args)
      requireApp(root)
      if (!fs.existsSync(path.join(root, 'node_modules'))) return fail('node_modules missing; run ext_web_install first')
      const result = await run('npm', ['run', 'build'], { cwd: root, timeoutMs: 900_000 })
      return result.code === 0 ? ok(formatRun(result)) : fail(formatRun(result))
    }

    if (name === 'test') {
      const root = appRoot(project, args)
      const packagePath = requireApp(root)
      const pkg = readJson(packagePath)
      if (!pkg.scripts?.test) return fail('no test script in package.json')
      const result = await run('npm', ['test', '--', '--run'], { cwd: root, timeoutMs: 900_000 })
      return result.code === 0 ? ok(formatRun(result)) : fail(formatRun(result))
    }

    if (name === 'start') {
      const root = appRoot(project, args)
      requireApp(root)
      const existing = runningPid(root)
      if (existing) return ok(`already running at ${existing.url} (pid ${existing.pid})`)
      const port = Math.min(65535, Math.max(1024, Number(args.port) || 5173))
      const logPath = path.join(root, LOG)
      const out = fs.openSync(logPath, 'a')
      const child = spawn('npm', ['run', 'dev', '--', '--host', '0.0.0.0', '--port', String(port)], {
        cwd: root,
        detached: true,
        stdio: ['ignore', out, out],
        env: { ...process.env, BROWSER: 'none' }
      })
      child.unref()
      const state = { pid: child.pid, port, url: `http://localhost:${port}`, startedAt: Date.now() }
      fs.writeFileSync(path.join(root, STATE), JSON.stringify(state, null, 2))
      return ok(`Started dev server at ${state.url} (pid ${child.pid}). Logs: ${LOG}`)
    }

    if (name === 'stop') {
      const root = appRoot(project, args)
      const state = runningPid(root)
      if (!state) return fail('dev server is not running')
      try {
        process.kill(-state.pid, 'SIGTERM')
      } catch {
        try {
          process.kill(state.pid, 'SIGTERM')
        } catch {
          // already gone
        }
      }
      fs.rmSync(path.join(root, STATE), { force: true })
      return ok(`Stopped dev server (pid ${state.pid})`)
    }

    if (name === 'status') {
      const root = appRoot(project, args)
      const state = runningPid(root)
      const log = tail(path.join(root, LOG))
      if (!state) return ok(`dev server is not running${log ? `\n\nlast log:\n${log}` : ''}`)
      return ok(`running at ${state.url} (pid ${state.pid})\n\nlast log:\n${log}`)
    }

    return fail(`unknown tool: ${name}`)
  }
})
