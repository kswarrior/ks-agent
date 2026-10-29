import fs from 'node:fs'
import path from 'node:path'
import { config } from './config.js'
import type { SkillInfo, ToolDef, ToolResult } from './types.js'

const NAME_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/
const MAX_SKILL_BYTES = 200_000

interface LoadedSkill extends SkillInfo {
  content: string
}

interface Frontmatter {
  name: string
  description: string
  body: string
}

function parseFrontmatter(raw: string): Frontmatter {
  const text = raw.replace(/\r\n/g, '\n')
  const match = /^---\n([\s\S]*?)\n---\n?/.exec(text)
  if (!match) return { name: '', description: '', body: text }
  const fields: Record<string, string> = {}
  for (const line of match[1].split('\n')) {
    const colon = line.indexOf(':')
    if (colon <= 0) continue
    const key = line.slice(0, colon).trim().toLowerCase()
    let value = line.slice(colon + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (key) fields[key] = value
  }
  return {
    name: fields.name ?? '',
    description: fields.description ?? '',
    body: text.slice(match[0].length)
  }
}

function firstMeaningfulLine(body: string): string {
  for (const line of body.split('\n')) {
    const text = line.replace(/^#+\s*/, '').trim()
    if (text) return text.slice(0, 300)
  }
  return ''
}

function readSkill(file: string, fallbackName: string, source: string): LoadedSkill | null {
  let stat: fs.Stats
  try {
    stat = fs.statSync(file)
  } catch {
    return null
  }
  if (!stat.isFile() || stat.size > MAX_SKILL_BYTES) return null
  let raw: string
  try {
    raw = fs.readFileSync(file, 'utf8')
  } catch {
    return null
  }
  const parsed = parseFrontmatter(raw)
  const name = (parsed.name || fallbackName).trim().toLowerCase()
  if (!NAME_RE.test(name)) return null
  const description = (parsed.description || firstMeaningfulLine(parsed.body) || `Skill ${name}`).slice(0, 500)
  return {
    name,
    description,
    path: file,
    source,
    content: parsed.body.trim()
  }
}

export class SkillRegistry {
  private skills = new Map<string, LoadedSkill>()

  discover(): SkillInfo[] {
    this.skills.clear()
    for (const dir of config.skillsDirs) {
      this.scan(dir)
    }
    return this.list()
  }

  private scan(dir: string): void {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'README.md') continue
      const full = path.join(dir, entry.name)
      let skill: LoadedSkill | null = null
      if (entry.isDirectory()) {
        const skillFile = path.join(full, 'SKILL.md')
        if (fs.existsSync(skillFile)) skill = readSkill(skillFile, entry.name, dir)
        else skill = this.scanLegacyFolder(full, dir)
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
        skill = readSkill(full, entry.name.replace(/\.md$/i, ''), dir)
      }
      if (skill && !this.skills.has(skill.name)) this.skills.set(skill.name, skill)
    }
  }

  private scanLegacyFolder(full: string, source: string): LoadedSkill | null {
    const preferred = ['skill.md', 'SKILL.md', 'index.md']
    for (const candidate of preferred) {
      const file = path.join(full, candidate)
      if (fs.existsSync(file)) return readSkill(file, path.basename(full), source)
    }
    return null
  }

  list(): SkillInfo[] {
    return [...this.skills.values()]
      .map(({ name, description, path: skillPath, source }) => ({ name, description, path: skillPath, source }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  count(): number {
    return this.skills.size
  }

  get(name: string): SkillInfo | null {
    const found = this.skills.get(name.trim().toLowerCase())
    if (!found) return null
    return { name: found.name, description: found.description, path: found.path, source: found.source }
  }

  toolDefs(): ToolDef[] {
    if (this.skills.size === 0) return []
    const names = [...this.skills.keys()].sort().join(', ')
    return [
      {
        type: 'function',
        function: {
          name: 'use_skill',
          description: `Load a reusable skill and follow its instructions. Available skills: ${names}. Call this before starting work that matches a skill.`,
          parameters: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'Exact skill name from the available skills list'
              }
            },
            required: ['name']
          }
        }
      }
    ]
  }

  promptSection(): string {
    if (this.skills.size === 0) return ''
    const lines = [...this.skills.values()]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((skill) => `- ${skill.name}: ${skill.description}`)
    return `## Skills
Reusable skills are installed. If a task matches a skill, call use_skill with the exact skill name before editing and follow the returned instructions.
${lines.join('\n')}`
  }

  call(name: string, args: Record<string, unknown>): ToolResult {
    if (name !== 'use_skill') return { ok: false, output: `Unknown skill tool: ${name}` }
    const requested = typeof args.name === 'string' ? args.name.trim() : ''
    if (!requested) return { ok: false, output: 'name is required' }
    const skill = this.skills.get(requested.toLowerCase())
    if (!skill) {
      const available = [...this.skills.keys()].sort().join(', ') || '(none)'
      return { ok: false, output: `Unknown skill "${requested}". Available skills: ${available}` }
    }
    const content = skill.content.length > config.maxToolOutput * 2
      ? `${skill.content.slice(0, config.maxToolOutput * 2)}\n[... skill truncated]`
      : skill.content
    return {
      ok: true,
      output: `<skill name="${skill.name}" description="${skill.description.replace(/"/g, "'")}">\n${content}\n</skill>`
    }
  }
}

export const skills = new SkillRegistry()
skills.discover()
