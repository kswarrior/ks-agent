const MAX_PROJECT_IDS = 200
const MAX_PROJECT_ID_LENGTH = 100

export function normalizeProjects(value: unknown): string[] {
  let items: unknown[] = []
  if (Array.isArray(value)) items = value
  else if (typeof value === 'string') items = value.split(',')
  else return []

  const projects: string[] = []
  for (const item of items) {
    if (typeof item !== 'string') continue
    const text = item
      .trim()
      .replace(/^\[/, '')
      .replace(/\]$/, '')
      .replace(/^["']|["']$/g, '')
      .trim()
    if (!text) continue
    if (/^(all|\*)$/i.test(text)) return []
    if (text.length > MAX_PROJECT_ID_LENGTH || text.includes('\0')) continue
    if (!projects.includes(text)) projects.push(text)
    if (projects.length >= MAX_PROJECT_IDS) break
  }
  return projects
}

export function isProjectEnabled(projects: string[], projectId: string): boolean {
  return projects.length === 0 || projects.includes(projectId)
}
