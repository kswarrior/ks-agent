import { useCallback, useEffect, useRef, useState } from 'react'
import * as api from './api'
import type { Chat, Message, ModelEntry, Plan, Project } from './types'
import { DialogsProvider, useDialogs } from './dialogs'
import { ToastProvider, useToast } from './toast'
import { Header } from './components/Header'
import { Sidebar } from './components/Sidebar'
import { RightSidebar } from './components/RightSidebar'
import { ChatView } from './components/ChatView'
import { SettingsModal } from './components/SettingsModal'
import { AddProjectModal } from './components/AddProjectModal'

const LS_PROJECT = 'ks.activeProject'
const LS_CHAT = 'ks.activeChat'
const LS_MODEL = 'ks.selectedModel'

function KsAgent() {
  const toast = useToast()
  const { confirm, prompt } = useDialogs()

  const [projects, setProjects] = useState<Project[]>([])
  const [chats, setChats] = useState<Chat[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [models, setModels] = useState<ModelEntry[]>([])
  const [plans, setPlans] = useState<Record<string, Plan>>({})

  const [activeProjectId, setActiveProjectId] = useState<string | null>(() => localStorage.getItem(LS_PROJECT))
  const [activeChatId, setActiveChatId] = useState<string | null>(() => localStorage.getItem(LS_CHAT))
  const [selectedModelId, setSelectedModelId] = useState<string | null>(() => localStorage.getItem(LS_MODEL))

  const [sidebarOpen, setSidebarOpen] = useState(() => window.matchMedia('(min-width: 900px)').matches)
  const [rsbOpen, setRsbOpen] = useState(() => window.matchMedia('(min-width: 1200px)').matches)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [addProjectOpen, setAddProjectOpen] = useState(false)

  // Keep the right workspace panel always open whenever the screen is wide
  // enough for it to fit next to the left sidebar and the composer input.
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1200px)')
    const onChange = (e: MediaQueryListEvent) => {
      if (e.matches) setRsbOpen(true)
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  // chatId → live text of its background generation (key present = still running)
  const [streams, setStreams] = useState<Record<string, string>>({})
  const subsRef = useRef(new Map<string, AbortController>())
  const activeChatIdRef = useRef<string | null>(null)
  const skipLoadForRef = useRef<string | null>(null)
  const creatingChatRef = useRef(false)

  const activeProject = projects.find((p) => p.id === activeProjectId) ?? null
  const activeChat = chats.find((c) => c.id === activeChatId) ?? null

  useEffect(() => {
    activeChatIdRef.current = activeChatId
  }, [activeChatId])

  // ---- initial load ----
  useEffect(() => {
    ;(async () => {
      try {
        const list = await api.listProjects()
        setProjects(list)
        if (list.length > 0 && !list.some((p) => p.id === activeProjectId)) {
          setActiveProjectId(list[0].id)
        }
        if (list.length === 0) setActiveProjectId(null)
      } catch (e: any) {
        toast(e.message, 'error')
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (activeProjectId) localStorage.setItem(LS_PROJECT, activeProjectId)
    else localStorage.removeItem(LS_PROJECT)
  }, [activeProjectId])

  useEffect(() => {
    if (activeChatId) localStorage.setItem(LS_CHAT, activeChatId)
    else localStorage.removeItem(LS_CHAT)
  }, [activeChatId])

  useEffect(() => {
    if (selectedModelId) localStorage.setItem(LS_MODEL, selectedModelId)
    else localStorage.removeItem(LS_MODEL)
  }, [selectedModelId])

  // load chats when project changes
  useEffect(() => {
    if (!activeProjectId) {
      setChats([])
      setActiveChatId(null)
      return
    }
    let cancelled = false
    api
      .listChats(activeProjectId)
      .then((list) => {
        if (cancelled) return
        setChats(list)
        setActiveChatId((prev) => (prev && list.some((c) => c.id === prev) ? prev : null))
      })
      .catch((e) => toast(e.message, 'error'))
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProjectId])

  // load messages when chat changes
  useEffect(() => {
    if (!activeChatId) {
      setMessages([])
      return
    }
    const skipLoad = skipLoadForRef.current === activeChatId
    skipLoadForRef.current = null
    if (skipLoad) return
    let cancelled = false
    api
      .listMessages(activeChatId)
      .then((list) => !cancelled && setMessages(list))
      .catch((e) => !cancelled && toast(e.message, 'error'))
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChatId])

  // load the chat's plan for the right sidebar
  useEffect(() => {
    if (!activeChatId) return
    let cancelled = false
    api
      .getPlan(activeChatId)
      .then((plan) => {
        if (cancelled) return
        setPlans((prev) => {
          const next = { ...prev }
          if (plan) next[activeChatId] = plan
          else delete next[activeChatId]
          return next
        })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChatId])

  // load models (+ keep selection valid)
  const refreshModels = useCallback(async () => {
    try {
      const list = await api.listModels()
      setModels(list)
      setSelectedModelId((prev) => (prev && list.some((m) => m.id === prev) ? prev : list[0]?.id ?? null))
    } catch (e: any) {
      toast(e.message, 'error')
    }
  }, [toast])

  useEffect(() => {
    refreshModels()
  }, [refreshModels])

  // ---- background generation tracking ----
  const trackGeneration = useCallback(
    (chatId: string) => {
      if (subsRef.current.has(chatId)) return
      const controller = new AbortController()
      subsRef.current.set(chatId, controller)
      setStreams((prev) => ({ ...prev, [chatId]: prev[chatId] ?? '' }))
      let acc = ''
      let assistantId: string | null = null
      api
        .streamChatEvents(
          chatId,
          {
            onMeta: (meta) => {
              assistantId = meta.assistantId
            },
            onSnapshot: (text) => {
              acc = text
              setStreams((prev) => ({ ...prev, [chatId]: text }))
            },
            onDelta: (text) => {
              acc += text
              setStreams((prev) => ({ ...prev, [chatId]: (prev[chatId] ?? '') + text }))
            },
            onError: (message) => toast(message.split('\n')[0], 'error'),
            onDone: () => {}
          },
          controller.signal
        )
        .catch((e: any) => {
          if (e?.name !== 'AbortError') toast(e.message, 'error')
        })
        .finally(async () => {
          subsRef.current.delete(chatId)
          if (acc.trim() && activeChatIdRef.current === chatId) {
            const id = assistantId || 'tmp-assistant-' + Date.now()
            setMessages((prev) =>
              prev.some((m) => m.id === id)
                ? prev
                : [
                    ...prev,
                    {
                      id,
                      chatId,
                      role: 'assistant' as const,
                      content: acc,
                      createdAt: new Date().toISOString()
                    }
                  ]
            )
          }
          setStreams((prev) => {
            const next = { ...prev }
            delete next[chatId]
            return next
          })
          try {
            const fresh = await api.listMessages(chatId)
            if (activeChatIdRef.current === chatId) setMessages(fresh)
            setChats((prev) =>
              [...prev].sort((a, b) =>
                a.id === chatId ? -1 : b.id === chatId ? 1 : b.updatedAt.localeCompare(a.updatedAt)
              )
            )
          } catch {}
        })
    },
    [toast]
  )

  // resume watching generations still running on the server (e.g. after tab reopen)
  useEffect(() => {
    api
      .listGenerations()
      .then((ids) => ids.forEach(trackGeneration))
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---- actions ----
  function selectProject(id: string) {
    setActiveProjectId(id)
    setActiveChatId(null)
    setMessages([])
    if (window.innerWidth < 900) setSidebarOpen(false)
  }

  async function newChat() {
    if (!activeProjectId) return
    try {
      const chat = await api.createChat(activeProjectId)
      setChats((prev) => [chat, ...prev])
      setActiveChatId(chat.id)
      setMessages([])
      if (window.innerWidth < 900) setSidebarOpen(false)
    } catch (e: any) {
      toast(e.message, 'error')
    }
  }

  async function renameProject(project: Project) {
    const name = await prompt({ title: 'Rename project', label: 'Name', value: project.name })
    if (!name || name === project.name) return
    try {
      const updated = await api.renameProject(project.id, name)
      setProjects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
    } catch (e: any) {
      toast(e.message, 'error')
    }
  }

  async function deleteProject(project: Project) {
    const ok = await confirm({
      title: `Delete "${project.name}"?`,
      message: 'All chats and messages in this project will be permanently removed.',
      danger: true,
      confirmText: 'Delete'
    })
    if (!ok) return
    try {
      await api.deleteProject(project.id)
      setProjects((prev) => prev.filter((p) => p.id !== project.id))
      if (activeProjectId === project.id) {
        setActiveProjectId(null)
        setActiveChatId(null)
        setMessages([])
      }
      toast('Project deleted', 'success')
    } catch (e: any) {
      toast(e.message, 'error')
    }
  }

  async function renameChat(chat: Chat) {
    const title = await prompt({ title: 'Rename chat', label: 'Title', value: chat.title })
    if (!title || title === chat.title) return
    try {
      const updated = await api.renameChat(chat.id, title)
      setChats((prev) => prev.map((c) => (c.id === updated.id ? updated : c)))
    } catch (e: any) {
      toast(e.message, 'error')
    }
  }

  async function deleteChat(chat: Chat) {
    const ok = await confirm({
      title: `Delete "${chat.title}"?`,
      message: 'All messages in this chat will be permanently removed.',
      danger: true,
      confirmText: 'Delete'
    })
    if (!ok) return
    try {
      await api.deleteChat(chat.id)
      subsRef.current.get(chat.id)?.abort()
      subsRef.current.delete(chat.id)
      setStreams((prev) => {
        const next = { ...prev }
        delete next[chat.id]
        return next
      })
      setChats((prev) => prev.filter((c) => c.id !== chat.id))
      if (activeChatId === chat.id) {
        setActiveChatId(null)
        setMessages([])
      }
      toast('Chat deleted', 'success')
    } catch (e: any) {
      toast(e.message, 'error')
    }
  }

  async function submitAddProject(p: { id: string }) {
    try {
      const list = await api.listProjects()
      setProjects(list)
      setActiveProjectId(p.id)
    } catch (e: any) {
      toast(e.message, 'error')
    }
  }

  function selectChat(id: string) {
    setActiveChatId(id)
    if (window.innerWidth < 900) setSidebarOpen(false)
  }

  // ---- sending ----
  async function send(content: string) {
    if (!selectedModelId) {
      toast('No model selected. Add one in Settings.', 'error')
      return
    }
    if (!activeProjectId) {
      toast('Select a project first', 'error')
      return
    }
    if (creatingChatRef.current) return

    let chatId = activeChatId

    if (!chatId) {
      creatingChatRef.current = true
      try {
        const chat = await api.createChat(activeProjectId)
        chatId = chat.id
        skipLoadForRef.current = chat.id
        setChats((prev) => [chat, ...prev])
        setActiveChatId(chat.id)
        setMessages([
          {
            id: 'tmp-' + Date.now(),
            chatId: chat.id,
            role: 'user',
            content,
            createdAt: new Date().toISOString()
          }
        ])
      } catch (e: any) {
        toast(e.message, 'error')
        return
      } finally {
        creatingChatRef.current = false
      }
    } else {
      const tempUserMsg: Message = {
        id: 'tmp-' + Date.now(),
        chatId,
        role: 'user',
        content,
        createdAt: new Date().toISOString()
      }
      setMessages((prev) => [...prev, tempUserMsg])
    }

    setStreams((prev) => ({ ...prev, [chatId]: prev[chatId] ?? '' }))

    try {
      await api.sendMessage(chatId, content, selectedModelId)
      trackGeneration(chatId)
    } catch (e: any) {
      toast(e.message, 'error')
      setStreams((prev) => {
        const next = { ...prev }
        delete next[chatId]
        return next
      })
      try {
        const fresh = await api.listMessages(chatId)
        if (activeChatIdRef.current === chatId) setMessages(fresh)
      } catch {}
    }
  }

  async function stopStreaming() {
    const chatId = activeChatId
    if (!chatId || !subsRef.current.has(chatId)) return
    try {
      await api.stopGeneration(chatId)
    } catch (e: any) {
      toast(e.message, 'error')
    }
  }

  // ---- render ----
  return (
    <div className="app">
      <Header onMenu={() => setSidebarOpen((v) => !v)} onToggleRight={() => setRsbOpen((v) => !v)} />
      <div className={`shell${sidebarOpen ? '' : ' sb-closed'}`}>
        <Sidebar
          open={sidebarOpen}
          projects={projects}
          activeProject={activeProject}
          chats={chats}
          activeChatId={activeChatId}
          onSelectProject={selectProject}
          onSelectChat={selectChat}
          onNewChat={newChat}
          onRenameChat={renameChat}
          onDeleteChat={deleteChat}
          onRenameProject={renameProject}
          onDeleteProject={deleteProject}
          onAddProject={() => setAddProjectOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
          onCloseMobile={() => setSidebarOpen(false)}
        />
        <main className="main">
          <ChatView
            chat={activeChat}
            hasProject={!!activeProject}
            messages={messages}
            streaming={activeChat ? streams[activeChat.id] !== undefined : false}
            streamText={activeChat ? streams[activeChat.id] ?? '' : ''}
            models={models}
            selectedModelId={selectedModelId}
            onSelectModel={setSelectedModelId}
            onSend={send}
            onStop={stopStreaming}
            onRequestSettings={() => setSettingsOpen(true)}
          />
        </main>
        <RightSidebar
          open={rsbOpen}
          activeProject={activeProject}
          onClose={() => setRsbOpen(false)}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      </div>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} onDataChanged={refreshModels} />
      <AddProjectModal open={addProjectOpen} onClose={() => setAddProjectOpen(false)} onCreated={submitAddProject} />
    </div>
  )
}

export default function App() {
  return (
    <ToastProvider>
      <DialogsProvider>
        <KsAgent />
      </DialogsProvider>
    </ToastProvider>
  )
}
