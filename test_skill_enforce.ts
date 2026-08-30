import { loadDb, getDb, newId, getSkills, messagesOf } from './server/src/store.js'
import { skillReads, hasReadSkill, recordSkillRead, getEnforcedSkillsForWrite, isFrontendEdit, executeTool } from './server/src/agent.js'
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
  console.log('Is frontend edit for web/src/App.tsx?', isFrontendEdit('web/src/App.tsx'))
  console.log('Enforced skills for web/src/App.tsx:', getEnforcedSkillsForWrite('web/src/App.tsx', chatId))
  console.log('Has read frontend/skill.md?', hasReadSkill(chatId, 'frontend/skill.md'))

  console.log('--- Test 1: try write without reading skill (should be blocked) ---')
  const ctx = { projectPath: project.path, chatId, onEvent: () => {}, signal: new AbortController().signal } as any
  const res1 = await executeTool('write_file', JSON.stringify({ path: 'web/src/App.tsx', content: 'test' }), ctx)
  console.log('write_file without skill read:', res1.ok ? 'UNEXPECTED OK' : `BLOCKED as expected: ${res1.result.slice(0,120)}`)

  console.log('--- Test 2: read frontend/skill.md then try again (should be allowed for main, but may still require sub-file) ---')
  const readRes = await executeTool('read_file', JSON.stringify({ path: 'frontend/skill.md' }), ctx)
  console.log('read_file frontend/skill.md:', readRes.ok ? 'OK' : `FAIL: ${readRes.result.slice(0,120)}`)
  console.log('After read, hasReadSkill:', hasReadSkill(chatId, 'frontend/skill.md'))
  console.log('Enforced after read:', getEnforcedSkillsForWrite('web/src/App.tsx', chatId))

  // For this test, the history mentions React, so it will also require frontend/react.md
  // Let's read that too
  const readReact = await executeTool('read_file', JSON.stringify({ path: 'frontend/react.md' }), ctx)
  console.log('read_file frontend/react.md:', readReact.ok ? 'OK' : `FAIL: ${readReact.result.slice(0,120)}`)
  console.log('Has read react?', hasReadSkill(chatId, 'frontend/react.md'))

  console.log('--- Test 3: try write again after reading both (should succeed if file exists, or at least not blocked by skill) ---')
  // Ensure the file exists first
  const testFile = path.join(project.path, 'web/src/App.tsx')
  fs.mkdirSync(path.dirname(testFile), { recursive: true })
  if (!fs.existsSync(testFile)) fs.writeFileSync(testFile, '// test', 'utf8')
  const res2 = await executeTool('write_file', JSON.stringify({ path: 'web/src/App.tsx', content: '// updated via skill test' }), ctx)
  console.log('write_file after skill reads:', res2.ok ? `OK: ${res2.result.slice(0,80)}` : `BLOCKED: ${res2.result.slice(0,120)}`)

  console.log('--- Test 4: verify read_file fallback for frontend/ts.md ---')
  const readTs = await executeTool('read_file', JSON.stringify({ path: 'frontend/ts.md' }), ctx)
  console.log('read_file frontend/ts.md:', readTs.ok ? 'OK' : `FAIL: ${readTs.result.slice(0,120)}`)

  console.log('--- Test 5: generic skill enforcement (testing.md) ---')
  const chatId2 = newId()
  db.chats.push({ id: chatId2, projectId: project.id, title: 'Test2', createdAt: now, updatedAt: now })
  db.messages.push({ id: newId(), chatId: chatId2, role: 'user', content: 'Please write tests for the project', createdAt: now })
  saveDb()
  const ctx2 = { projectPath: project.path, chatId: chatId2, onEvent: () => {}, signal: new AbortController().signal } as any
  console.log('Enforced for testing context, web/src/App.tsx:', getEnforcedSkillsForWrite('web/src/App.tsx', chatId2))
  // Should also include testing skill if history mentions testing?
  // Our getRelevantSkillsFromHistory for "write tests" will include testing.md
  const testWrite = await executeTool('write_file', JSON.stringify({ path: 'web/src/test.ts', content: 'test' }), ctx2)
  console.log('write_file for testing context without reading testing skill:', testWrite.ok ? 'OK (maybe not blocked if not frontend)' : `BLOCKED: ${testWrite.result.slice(0,120)}`)
  // Now read testing skill and try again
  const readTest = await executeTool('read_file', JSON.stringify({ path: 'testing.md' }), ctx2)
  console.log('read testing.md:', readTest.ok ? 'OK' : 'FAIL')
  const testWrite2 = await executeTool('write_file', JSON.stringify({ path: 'web/src/test2.ts', content: 'test2' }), ctx2)
  console.log('write after reading testing skill:', testWrite2.ok ? 'OK' : `BLOCKED: ${testWrite2.result.slice(0,120)}`)

  // Clean up
  db.chats = db.chats.filter(c => c.id !== chatId && c.id !== chatId2)
  db.messages = db.messages.filter(m => m.chatId !== chatId && m.chatId !== chatId2)
  // clean up test files
  try { fs.unlinkSync(path.join(project.path, 'web/src/App.tsx')) } catch {}
  try { fs.unlinkSync(path.join(project.path, 'web/src/test.ts')) } catch {}
  try { fs.unlinkSync(path.join(project.path, 'web/src/test2.ts')) } catch {}
  skillReads.delete(chatId)
  skillReads.delete(chatId2)
  saveDb()
  console.log('--- All tests complete ---')
}

main().catch(e => { console.error(e); process.exit(1) })
