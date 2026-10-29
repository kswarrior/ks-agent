import { useCallback, useEffect, useRef, useState } from 'react'
import * as api from './api'
import { ChatView } from './components/ChatView'
import { ConfirmModal, Modal, PromptModal } from './components/Modal'
import { ExtensionsModal } from './components/ExtensionsModal'
import { SettingsModal } from './components/SettingsModal'
import { Sidebar } from './components/Sidebar'
import type { Chat, ExtensionInfo, LiveState, Message, ModelEntry, Project, ProviderPublic } from './types'

export default function App() {
  const [projects, setProjects] = useState<Project[]>([])
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)
  const [chats, setChats] = useState<Chat[]>([])
  const [activeChatId, setActiveChatId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [providers, setProviders] = useState<ProviderPublic[]>([])
  const [models, setModels] = useState<ModelEntry[]>([])
  const [extensions, setExtensions] = useState<ExtensionInfo[]>([])
  const [modelId, setModelId] = useState('')
  const [live, setLive] = useState<LiveState | null>(null)
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [bootError, setBootError] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showExtensions, setShowExtensions] = useState(false)
  const [renameTarget, setRenameTarget] = useState<Chat | null>(null)
  const [deleteChatTarget, setDeleteChatTarget] = useState<Chat | null>(null)
  const [deleteProjectTarget, setDeleteProjectTarget] = useState<Project | null>(null)

  const activeChatIdRef = useRef<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    activeChatIdRef.current = activeChatId
  }, [activeChatId])

  const refreshProviders = useCallback(async () => setProviders(await api.listProviders()), [])
  const refreshModels = useCallback(async () => setModels(await api.listModels()), [])
  const refreshExtensions = useCallback(async () => setExtensions(await api.listExtensions()), [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const [projectList, providerList, modelList, extensionList] = await Promise.all([
          api.listProjects(),
          api.listProviders(),
          api.listModels(),
          api.listExtensions()
        ])
        if (cancelled) return
        setProjects(projectList)
        setProviders(providerList)
        setModels(modelList)
        setExtensions(extensionList)
        if (projectList.length) setActiveProjectId((current) => current ?? projectList[0].id)
      } catch (caught) {
        if (!cancelled) setBootError(caught instanceof Error ? caught.message : String(caught))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!activeProjectId) {
      setChats([])
      setActiveChatId(null)
      return
    }
    let cancelled = false
    void api
      .listChats(activeProjectId)
      .then((list) => {
        if (cancelled) return
        setChats(list)
        setActiveChatId((current) => (list.some((chat) => chat.id === current) ? current : list[0]?.id ?? null))
      })
      .catch((caught) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : String(caught))
      })
    return () => {
      cancelled = true
    }
  }, [activeProjectId])

  useEffect(() => {
    if (!activeChatId) {
      setMessages([])
      return
    }
    let cancelled = false
    setLive(null)
    void api
      .listMessages(activeChatId)
      .then((list) => {
        if (!cancelled) setMessages(list)
      })
      .catch((caught) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : String(caught))
      })
    return () => {
      cancelled = true
    }
  }, [activeChatId])

  useEffect(() => {
    const chat = chats.find((entry) => entry.id === activeChatId)
    const preferred =
      chat?.modelId && models.some((model) => model.id === chat.modelId) ? chat.modelId : models[0]?.id ?? ''
    setModelId(preferred)
  }, [activeChatId, chats, models])

  const activeProject = projects.find((project) => project.id === activeProjectId) ?? null
  const activeChat = chats.find((chat) => chat.id === activeChatId) ?? null

  const selectProject = (project: Project) => {
    if (streaming) return
    setActiveProjectId(project.id)
    setSidebarOpen(false)
  }

  const selectChat = (chat: Chat) => {
    if (streaming) return
    setActiveChatId(chat.id)
    setSidebarOpen(false)
  }

  const createProject = async (name: string, path: string) => {
    const project = await api.createProject({ name, path: path.trim() || undefined })
    setProjects((current) => [...current, project])
    setActiveProjectId(project.id)
    setShowCreate(false)
  }

  const createChat = async () => {
    if (!activeProjectId) return
    try {
      const chat = await api.createChat(activeProjectId, { modelId: modelId || null })
      setChats((current) => [chat, ...current])
      setActiveChatId(chat.id)
      setMessages([])
      setSidebarOpen(false)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    }
  }

  const renameChat = async (chat: Chat, title: string) => {
    try {
      const updated = await api.updateChat(chat.id, { title })
      setChats((current) => current.map((entry) => (entry.id === updated.id ? updated : entry)))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    }
  }

  const removeChat = async (chat: Chat) => {
    try {
      await api.deleteChat(chat.id)
      const remaining = chats.filter((entry) => entry.id !== chat.id)
      setChats(remaining)
      if (activeChatId === chat.id) setActiveChatId(remaining[0]?.id ?? null)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    }
  }

  const removeProject = async (project: Project) => {
    try {
      await api.deleteProject(project.id)
      const remaining = projects.filter((entry) => entry.id !== project.id)
      setProjects(remaining)
      if (activeProjectId === project.id) setActiveProjectId(remaining[0]?.id ?? null)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    }
  }

  const send = async (content: string) => {
    if (!activeChat || !modelId || streaming) return
    const chatId = activeChat.id
    const projectId = activeChat.projectId
    setStreaming(true)
    setError(null)
    setLive({ content: '', reasoning: '', tools: [], step: 0 })

    const optimistic: Message = {
      id: `local-${Date.now()}`,
      chatId,
      role: 'user',
      content,
      toolCalls: null,
      toolCallId: null,
      createdAt: Date.now()
    }
    setMessages((current) => [...current, optimistic])

    const controller = new AbortController()
    abortRef.current = controller
    try {
      await api.streamMessage(
        chatId,
        content,
        modelId,
        (event) => {
          if (event.type === 'assistant_start') {
            setLive((current) =>
              current ? { ...current, content: '', reasoning: '', tools: [], step: event.step } : current
            )
          } else if (event.type === 'step') {
            setLive((current) => (current ? { ...current, step: event.step } : current))
          } else if (event.type === 'token') {
            setLive((current) => (current ? { ...current, content: current.content + event.text } : current))
          } else if (event.type === 'reasoning') {
            setLive((current) => (current ? { ...current, reasoning: current.reasoning + event.text } : current))
          } else if (event.type === 'tool_start') {
            setLive((current) =>
              current
                ? {
                    ...current,
                    tools: [
                      ...current.tools,
                      {
                        id: event.call.id,
                        name: event.call.name,
                        arguments: event.call.arguments,
                        status: 'running'
                      }
                    ]
                  }
                : current
            )
          } else if (event.type === 'tool_end') {
            setLive((current) =>
              current
                ? {
                    ...current,
                    tools: current.tools.map((tool) =>
                      tool.id === event.call.id
                        ? {
                            ...tool,
                            status: event.result.ok ? 'ok' : 'error',
                            output: event.result.output,
                            durationMs: event.durationMs
                          }
                        : tool
                    )
                  }
                : current
            )
          } else if (event.type === 'error') {
            setError(event.error)
          } else if (event.type === 'done' && event.aborted) {
            setError('Stopped by user.')
          }
        },
        controller.signal
      )
    } catch (caught) {
      if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      abortRef.current = null
      if (activeChatIdRef.current === chatId) {
        try {
          const [list, chatList] = await Promise.all([api.listMessages(chatId), api.listChats(projectId)])
          if (activeChatIdRef.current === chatId) {
            setMessages(list)
            setChats(chatList)
          }
        } catch {
          // the final state can be reloaded manually
        }
      }
      setStreaming(false)
      setLive(null)
    }
  }

  const stop = async () => {
    if (!activeChatId) return
    try {
      await api.stopChat(activeChatId)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    }
  }

  const refreshSettings = async () => {
    await Promise.all([refreshProviders(), refreshModels()])
  }

  return (
    <div className="app-shell">
      <Sidebar
        projects={projects}
        activeProjectId={activeProjectId}
        chats={chats}
        activeChatId={activeChatId}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onSelectProject={selectProject}
        onCreateProject={() => setShowCreate(true)}
        onDeleteProject={setDeleteProjectTarget}
        onSelectChat={selectChat}
        onCreateChat={createChat}
        onRenameChat={setRenameTarget}
        onDeleteChat={setDeleteChatTarget}
        onOpenSettings={() => setShowSettings(true)}
        onOpenExtensions={() => setShowExtensions(true)}
      />

      <ChatView
        project={activeProject}
        chat={activeChat}
        messages={messages}
        models={models}
        modelId={modelId}
        live={live}
        streaming={streaming}
        error={error}
        onModelChange={setModelId}
        onSend={send}
        onStop={stop}
        onOpenSidebar={() => setSidebarOpen(true)}
      />

      {bootError && <div className="boot-error">{bootError}</div>}

      {showCreate && <CreateProjectModal onClose={() => setShowCreate(false)} onCreate={createProject} />}

      {showSettings && (
        <SettingsModal
          providers={providers}
          models={models}
          onClose={() => setShowSettings(false)}
          onRefresh={refreshSettings}
        />
      )}

      {showExtensions && (
        <ExtensionsModal
          extensions={extensions}
          onClose={() => setShowExtensions(false)}
          onRefresh={refreshExtensions}
        />
      )}

      {renameTarget && (
        <PromptModal
          title="Rename chat"
          label="Title"
          initialValue={renameTarget.title}
          onClose={() => setRenameTarget(null)}
          onSubmit={(value) => void renameChat(renameTarget, value)}
        />
      )}

      {deleteChatTarget && (
        <ConfirmModal
          title="Delete chat"
          message={`Delete "${deleteChatTarget.title || 'New chat'}" and all its messages? This cannot be undone.`}
          onClose={() => setDeleteChatTarget(null)}
          onConfirm={() => void removeChat(deleteChatTarget)}
        />
      )}

      {deleteProjectTarget && (
        <ConfirmModal
          title="Remove project"
          message={`Remove "${deleteProjectTarget.name}" from KS Agent? Files on disk are kept.`}
          confirmLabel="Remove"
          onClose={() => setDeleteProjectTarget(null)}
          onConfirm={() => void removeProject(deleteProjectTarget)}
        />
      )}
    </div>
  )
}

function CreateProjectModal({
  onClose,
  onCreate
}: {
  onClose: () => void
  onCreate: (name: string, path: string) => Promise<void>
}) {
  const [name, setName] = useState('')
  const [path, setPath] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  return (
    <Modal title="New project" onClose={onClose}>
      {error && <div className="error-banner">{error}</div>}
      <form
        onSubmit={(event) => {
          event.preventDefault()
          if (!name.trim()) return
          setBusy(true)
          setError(null)
          void onCreate(name.trim(), path)
            .catch((caught) => setError(caught instanceof Error ? caught.message : String(caught)))
            .finally(() => setBusy(false))
        }}
      >
        <label className="field">
          <span>Name</span>
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="my-project" autoFocus />
        </label>
        <label className="field">
          <span>Folder (optional)</span>
          <input value={path} onChange={(event) => setPath(event.target.value)} placeholder="defaults to the project name" />
        </label>
        <p className="muted small">
          The folder is created under the projects directory. The agent can only read and write inside it.
        </p>
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={busy || !name.trim()}>
            {busy ? 'Creating…' : 'Create project'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
