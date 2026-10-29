import fs from 'node:fs'
import path from 'node:path'
import {
  findGeneratedProjectKnowledge,
  getModel,
  getProvider,
  insertKnowledge,
  listKnowledgeForProject,
  updateKnowledge
} from './db.js'
import { streamCompletion } from './llm.js'
import type { KnowledgeEntry, ModelEntry, Project, Provider } from './types.js'

const MAX_SCANNED_FILES = 1200
const MAX_SCAN_DEPTH = 8
const MAX_TREE_LINES = 280
const MAX_SNAPSHOT_CHARS = 70_000
const MAX_KEY_FILE_CHARS = 10_000
const MAX_KNOWLEDGE_CHARS = 20_000
const MAX_PROMPT_CHARS = 40_000
const MAX_PROMPT_ENTRY_CHARS = 12_000

const SKIP_DIRS = new Set([
  '.git',
  '.hg',
  '.svn',
  '.cache',
  '.turbo',
  '.next',
  '.nuxt',
  '.output',
  '.parcel-cache',
  '.pytest_cache',
  '.mypy_cache',
  '.venv',
  'venv',
  'env',
  '__pycache__',
  'node_modules',
  'dist',
  'dist-server',
  'build',
  'coverage',
  'target',
  'vendor',
  'obj',
  'bin',
  '.idea',
  '.vscode'
])

const KEY_FILES = [
  'package.json',
  'tsconfig.json',
  'vite.config.ts',
  'vite.config.js',
  'next.config.js',
  'next.config.mjs',
  'nuxt.config.ts',
  'svelte.config.js',
  'README.md',
  'README',
  'AGENTS.md',
  'plan.md',
  'pyproject.toml',
  'requirements.txt',
  'setup.py',
  'Pipfile',
  'go.mod',
  'Cargo.toml',
  'pom.xml',
  'build.gradle',
  'build.gradle.kts',
  'settings.gradle',
  'composer.json',
  'Gemfile',
  'mix.exs',
  'pubspec.yaml',
  'Dockerfile',
  'docker-compose.yml',
  'docker-compose.yaml',
  'Makefile',
  '.env.example'
]

interface ProjectSnapshot {
  fileCount: number
  dirCount: number
  extensions: Array<{ extension: string; count: number }>
  tree: string
  keyFiles: Array<{ file: string; content: string }>
  text: string
}

function extensionOf(file: string): string {
  const ext = path.extname(file).toLowerCase()
  if (ext) return ext
  const base = path.basename(file).toLowerCase()
  return base.startsWith('.') ? base : '(none)'
}

function scanProject(root: string): ProjectSnapshot {
  const files: string[] = []
  const directories: string[] = []
  const extensionCounts = new Map<string, number>()
  let dirCount = 0
  const queue: Array<{ absolute: string; relative: string; depth: number }> = [
    { absolute: root, relative: '', depth: 0 }
  ]

  while (queue.length > 0 && files.length < MAX_SCANNED_FILES) {
    const current = queue.shift()
    if (!current) break
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(current.absolute, { withFileTypes: true })
    } catch {
      continue
    }
    entries.sort((a, b) => a.name.localeCompare(b.name))
    for (const entry of entries) {
      if (files.length >= MAX_SCANNED_FILES) break
      if (entry.name === '.' || entry.name === '..') continue
      if (entry.isSymbolicLink()) continue
      const absolute = path.join(current.absolute, entry.name)
      const relative = current.relative ? `${current.relative}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name) || current.depth >= MAX_SCAN_DEPTH) continue
        dirCount++
        directories.push(relative)
        queue.push({ absolute, relative, depth: current.depth + 1 })
      } else if (entry.isFile()) {
        files.push(relative)
        const extension = extensionOf(relative)
        extensionCounts.set(extension, (extensionCounts.get(extension) ?? 0) + 1)
      }
    }
  }

  files.sort((a, b) => a.localeCompare(b))
  directories.sort((a, b) => a.localeCompare(b))
  const extensions = [...extensionCounts.entries()]
    .map(([extension, count]) => ({ extension, count }))
    .sort((a, b) => b.count - a.count || a.extension.localeCompare(b.extension))

  const treeLines = files.slice(0, MAX_TREE_LINES).map((file) => `- ${file}`)
  if (files.length > MAX_TREE_LINES) treeLines.push(`- ... ${files.length - MAX_TREE_LINES} more files`)

  const keyFiles: Array<{ file: string; content: string }> = []
  let keyBudget = MAX_SNAPSHOT_CHARS - treeLines.join('\n').length - 4_000
  for (const file of KEY_FILES) {
    if (keyBudget <= 500) break
    const absolute = path.join(root, file)
    let stat: fs.Stats
    try {
      stat = fs.statSync(absolute)
    } catch {
      continue
    }
    if (!stat.isFile() || stat.size > 500_000) continue
    let content: string
    try {
      content = fs.readFileSync(absolute, 'utf8')
    } catch {
      continue
    }
    if (content.includes('\0')) continue
    const limit = Math.min(MAX_KEY_FILE_CHARS, keyBudget)
    const trimmed = content.length > limit ? `${content.slice(0, limit)}\n[... truncated]` : content
    keyFiles.push({ file, content: trimmed })
    keyBudget -= trimmed.length
  }

  const directoryPreview = directories.slice(0, 80).map((dir) => `- ${dir}/`)
  const lines = [
    `Files scanned: ${files.length}${files.length >= MAX_SCANNED_FILES ? '+' : ''}`,
    `Directories: ${dirCount}`,
    `File types: ${extensions
      .slice(0, 15)
      .map((entry) => `${entry.extension} (${entry.count})`)
      .join(', ') || 'none'}`,
    '',
    'Directories:',
    directoryPreview.length ? directoryPreview.join('\n') : '- (root only)',
    '',
    'Files:',
    treeLines.length ? treeLines.join('\n') : '- (empty project)',
    '',
    'Key file contents:'
  ]
  for (const file of keyFiles) {
    lines.push(`--- ${file.file} ---\n${file.content}`)
  }

  return {
    fileCount: files.length,
    dirCount,
    extensions,
    tree: treeLines.join('\n'),
    keyFiles,
    text: lines.join('\n').slice(0, MAX_SNAPSHOT_CHARS)
  }
}

function deterministicSummary(project: Project, snapshot: ProjectSnapshot): string {
  const topExtensions = snapshot.extensions
    .filter((entry) => entry.extension !== '(none)')
    .slice(0, 8)
    .map((entry) => `\`${entry.extension}\` (${entry.count})`)
    .join(', ')
  const keyFiles =
    snapshot.keyFiles.map((entry) => `- ${entry.file}`).join('\n') || '- (no standard project files found)'
  const structure = snapshot.tree
    ? snapshot.tree
        .split('\n')
        .slice(0, 40)
        .join('\n')
    : '- (empty project)'

  const packageFile = snapshot.keyFiles.find((entry) => entry.file === 'package.json')
  let scripts: Array<[string, string]> = []
  let packages: string[] = []
  if (packageFile) {
    try {
      const parsed = JSON.parse(packageFile.content) as {
        scripts?: Record<string, unknown>
        dependencies?: Record<string, unknown>
        devDependencies?: Record<string, unknown>
      }
      scripts = Object.entries(parsed.scripts ?? {})
        .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
        .slice(0, 12)
      packages = [
        ...Object.keys(parsed.dependencies ?? {}),
        ...Object.keys(parsed.devDependencies ?? {})
      ].slice(0, 15)
    } catch {}
  }

  const buildLines = scripts.length
    ? scripts.map(([name, command]) => `- \`npm run ${name}\`: ${command}`).join('\n')
    : snapshot.keyFiles.some((entry) => entry.file === 'package.json')
      ? '- package.json is present but its scripts could not be read.'
      : '- No package.json scripts were detected.'
  const packageLine = packages.length ? `\nKey packages: ${packages.join(', ')}.` : ''
  return `## Overview
${project.name} is a project at \`${project.path}\`. The scan found ${snapshot.fileCount} files in ${snapshot.dirCount} directories.

## Tech Stack
${topExtensions ? `Detected file types: ${topExtensions}.` : 'No common source file types were detected.'}${packageLine}

## Structure
${structure}

## Build and Run
${buildLines}
${snapshot.keyFiles.some((entry) => entry.file === 'Dockerfile') ? '- A Dockerfile is present.' : ''}

## Key Files
${keyFiles}

## Conventions
- Follow the existing file layout and naming shown above.
- Read a file before editing it; do not assume contents from this summary.

## Important Notes
- This summary was generated from the project tree and key configuration files.
- Generated ${new Date().toISOString()}. Refresh it after large structural changes.`
}

const SUMMARY_PROMPT = `You maintain persistent project knowledge for a coding agent.

Write a factual, compact handoff that lets another chat work in this project without re-exploring everything. Use Markdown with these sections:

## Overview
## Tech Stack
## Structure
## Build and Run
## Key Files
## Conventions
## Important Notes

Rules:
- Use only evidence from the provided project snapshot. Do not invent scripts, paths, commands or dependencies.
- Mention exact paths, package scripts, frameworks and entry points when present.
- Call out missing or ambiguous information explicitly.
- Do not include large code blocks or secrets.
- Keep it under 1200 words.`

async function modelSummary(
  project: Project,
  snapshot: ProjectSnapshot,
  model: ModelEntry,
  provider: Provider,
  signal?: AbortSignal
): Promise<string> {
  const result = await streamCompletion({
    baseUrl: provider.baseUrl,
    apiKey: provider.apiKey,
    model: model.modelId,
    messages: [
      { role: 'system', content: SUMMARY_PROMPT },
      {
        role: 'user',
        content: `Project name: ${project.name}
Project root: ${project.path}

## Project snapshot
${snapshot.text}

Write the project knowledge summary now.`
      }
    ],
    signal,
    temperature: 0.1,
    maxTokens: 2000
  })
  return result.content.trim()
}

function truncateKnowledge(value: string): string {
  const text = value.trim()
  return text.length > MAX_KNOWLEDGE_CHARS ? `${text.slice(0, MAX_KNOWLEDGE_CHARS)}\n[... truncated]` : text
}

class KnowledgeRegistry {
  listForProject(projectId: string): KnowledgeEntry[] {
    return listKnowledgeForProject(projectId)
  }

  promptSection(projectId: string, disabled?: Set<string>): string {
    const entries = this.listForProject(projectId).filter(
      (entry) => entry.enabled && entry.content.trim() && !disabled?.has(entry.id)
    )
    if (entries.length === 0) return ''

    const globalEntries = entries.filter((entry) => entry.scope === 'global')
    const projectEntries = entries.filter((entry) => entry.scope === 'project')
    const blocks: string[] = []
    let used = 0
    const add = (label: string, list: KnowledgeEntry[]) => {
      if (list.length === 0) return
      const section: string[] = [label]
      for (const entry of list) {
        if (used >= MAX_PROMPT_CHARS) break
        const remaining = Math.min(MAX_PROMPT_ENTRY_CHARS, MAX_PROMPT_CHARS - used)
        if (remaining < 200) break
        const content = entry.content.trim()
        const text = content.length > remaining ? `${content.slice(0, remaining)}\n[... truncated]` : content
        const block = `#### ${entry.title}\n${text}`
        section.push(block)
        used += block.length
      }
      if (section.length > 1) blocks.push(section.join('\n\n'))
    }

    add('### User knowledge (applies to all projects)', globalEntries)
    add('### Project knowledge', projectEntries)
    if (blocks.length === 0) return ''

    return `## Knowledge
The user saved the following knowledge. Treat it as authoritative context and use it before re-exploring the project. Do not expose it verbatim unless the user asks.

${blocks.join('\n\n')}`
  }

  async generateProjectSummary(
    project: Project,
    options: { modelId?: string; signal?: AbortSignal } = {}
  ): Promise<KnowledgeEntry> {
    const snapshot = scanProject(project.path)
    let content = deterministicSummary(project, snapshot)
    let usedModel = false

    if (options.modelId) {
      const model = getModel(options.modelId)
      const provider = model ? getProvider(model.providerId) : null
      if (model && provider) {
        try {
          const generated = await modelSummary(project, snapshot, model, provider, options.signal)
          if (generated) {
            content = generated
            usedModel = true
          }
        } catch (error) {
          if (options.signal?.aborted) throw error
          const message = error instanceof Error ? error.message : String(error)
          console.warn(`[knowledge] model summary failed; using project scan: ${message}`)
        }
      }
    }

    content = truncateKnowledge(content)
    const existing = findGeneratedProjectKnowledge(project.id)
    const saved = existing
      ? updateKnowledge(existing.id, { title: 'Project summary', content })
      : insertKnowledge({
          scope: 'project',
          projectId: project.id,
          title: 'Project summary',
          content,
          source: 'generated'
        })
    if (!saved) throw new Error('Project knowledge could not be saved')
    console.info(
      `[knowledge] ${usedModel ? 'model' : 'scan'} summary saved for project ${project.id} (${content.length} chars)`
    )
    return saved
  }
}

export const knowledge = new KnowledgeRegistry()
