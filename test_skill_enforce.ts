import { loadDb, getDb, newId, getSkills, messagesOf } from './server/src/store.js'
import { skillReads } from './server/src/agent.js'
import fs from 'node:fs'
import path from 'node:path'

async function main() {
  loadDb()
  const db = getDb()
  let project = db.projects[0]
  if (!project) {
    const id = newId()
    project = { id, name: 'TestProj', path: path.resolve('project/test-skill'), createdAt: new Date().toISOString() }
    db.projects.push(project)
    fs.mkdirSync(project.path, { recursive: true })
    const { saveDb } = await import('./server/src/store.js')
    saveDb()
  }
  console.log('Project:', project)

  const chatId = newId()
  const now = new Date().toISOString()
  db.chats.push({ id: chatId, projectId: project.id, title: 'Test', createdAt: now, updatedAt: now })
  db.messages.push({ id: newId(), chatId, role: 'user', content: 'Please edit frontend React component in web/src/App.tsx', createdAt: now })
  const { saveDb } = await import('./server/src/store.js')
  saveDb()

  console.log('--- Testing skill file existence ---')
  const skillPaths = [
    'skills/frontend/skill.md',
    'skills/frontend/react.md',
    'skills/frontend/ts.md',
    'skills/frontend/ejs.md',
  ]
  for (const p of skillPaths) {
    const exists = fs.existsSync(path.join(process.cwd(), p))
    console.log(`${p}: ${exists ? 'exists' : 'MISSING'} ${exists ? fs.statSync(path.join(process.cwd(), p)).size + 'B' : ''}`)
  }

  console.log('--- Testing getSkills ---')
  const skills = getSkills()
  console.log('Skills count:', skills.length)
  const frontend = skills.find(s => s.name.toLowerCase() === 'frontend')
  console.log('Frontend skill:', frontend)

  console.log('--- Testing skillReads tracking ---')
  console.log('Initial reads:', skillReads.get(chatId))

  console.log('--- Testing read_file fallback for frontend/skill.md ---')
  const skillsDir = path.join(process.cwd(), 'skills')
  const rel = 'frontend/skill.md'
  const candidates = [
    path.join(skillsDir, path.basename(rel)),
    path.join(skillsDir, rel),
    path.join(process.cwd(), rel),
  ]
  for (const cand of candidates) {
    console.log(`Candidate ${cand}: ${fs.existsSync(cand) ? 'exists' : 'not found'}`)
  }

  // Clean up test chat
  db.chats = db.chats.filter(c => c.id !== chatId)
  db.messages = db.messages.filter(m => m.chatId !== chatId)
  saveDb()
  console.log('--- Test complete ---')
}

main().catch(e => { console.error(e); process.exit(1) })
