import { useCallback, useEffect, useRef, useState } from 'react'
import * as api from './api'
import type { Chat, Message, ModelEntry, Project } from './types'
import { DialogsProvider, useDialogs } from './dialogs'
import { ToastProvider, useToast } from './toast'
import { Header } from './components/Header'
import { Sidebar } from './components/Sidebar'
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

  const [activeProjectId, setActiveProjectId] = useState<string | null>(() => localStorage.getItem(LS_PROJECT))
  const [activeChatId, setActiveChatId] = useState<string | null>(() => localStorage.getItem(LS_CHAT))
  const [selectedModelId, setSelectedModelId] = useState<string | null>(() => localStorage.getItem(LS_MODEL))

  const [sidebarOpen, setSidebarOpen] = useState(() => window.matchMedia('(min-width: 900px)').matches)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [addProjectOpen, setAddProjectOpen] = useState(false)

  const [streaming, setStreaming] = useState(false)
  const [streamText, setStreamText] = useState('')
  const abortRef = useRef<AbortController | null>(null)
  const skipLoadForRef = useRef<string | null>(null)
  const creatingChatRef = useRef(false)

  const activeProject = projects.find((p) => p.id === activeProjectId) ?? null
  const activeChat = chats.find((c) => c.id === activeChatId) ?? null

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
    if (skipLoadForRef.current === activeChatId) {
      skipLoadForRef.current = null
      return
    }
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

  // ---- actions ----
  function selectProject(id: string) {
    if (streaming) abortRef.current?.abort()
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
    if (streaming) abortRef.current?.abort()
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

    setStreaming(true)
    setStreamText('')

    const controller = new AbortController()
    abortRef.current = controller

    try {
      await api.sendMessage(
        chatId,
        content,
        selectedModelId,
        {
          onDelta: (text) => setStreamText((prev) => prev + text),
          onError: (message) => toast(message.split('\n')[0], 'error'),
          onDone: () => {}
        },
        controller.signal
      )
    } catch (e: any) {
      if (e.name !== 'AbortError') toast(e.message, 'error')
    } finally {
      abortRef.current = null
      setStreaming(false)
      setStreamText('')
      try {
        const fresh = await api.listMessages(chatId)
        setMessages(fresh)
        setChats((prev) =>
          [...prev].sort((a, b) =>
            a.id === chatId ? -1 : b.id === chatId ? 1 : b.updatedAt.localeCompare(a.updatedAt)
          )
        )
      } catch {}
    }
  }

  function stopStreaming() {
    abortRef.current?.abort()
  }

  // ---- render ----
  return (
    <div className="app">
      <Header onMenu={() => setSidebarOpen((v) => !v)} />
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
          onAddProject={() => setAddProjectOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
          onCloseMobile={() => setSidebarOpen(false)}
        />
        <main className="main">
          <ChatView
            chat={activeChat}
            hasProject={!!activeProject}
            messages={messages}
            streaming={streaming}
            streamText={streamText}
            models={models}
            selectedModelId={selectedModelId}
            onSelectModel={setSelectedModelId}
            onSend={send}
            onStop={stopStreaming}
            onRequestSettings={() => setSettingsOpen(true)}
          />
        </main>
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
