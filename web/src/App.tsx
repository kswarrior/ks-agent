import { useCallback, useEffect, useRef, useState } from 'react'
import * as api from './api'
import { ChatView } from './components/ChatView'
import { ConfirmModal, Modal } from './components/Modal'
import { ExtensionsModal } from './components/ExtensionsModal'
import { RightSidebar } from './components/RightSidebar'
import { SettingsModal } from './components/SettingsModal'
import { Sidebar } from './components/Sidebar'
import type {
  AgentEvent,
  Chat,
  ChatExtensionsState,
  ChatSummary,
  ExtensionInfo,
  ExtensionKind,
  FailureInfo,
  LiveState,
  LspServerInfo,
  McpServerInfo,
  Message,
  ModelEntry,
  Project,
  ProviderPublic,
  RetryStatus,
  RunStep,
  SkillInfo
} from './types'

function finishStep(step: RunStep, status: 'done' | 'error', now: number): RunStep {
  const toolStatus = status === 'done' ? 'ok' : 'error'
  return {
    ...step,
    status,
    durationMs: step.durationMs ?? Math.max(0, now - step.startedAt),
    tools: step.tools.map((tool) => (tool.status === 'running' ? { ...tool, status: toolStatus } : tool))
  }
}

function beginStep(steps: RunStep[], step: number): RunStep[] {
  if (steps.some((entry) => entry.step === step)) return steps
  const now = Date.now()
  return [
    ...steps.map((entry) => (entry.status === 'running' ? finishStep(entry, 'done', now) : entry)),
    { step, content: '', tools: [], status: 'running', startedAt: now }
  ]
}

function updateLastStep(steps: RunStep[], update: (step: RunStep) => RunStep): RunStep[] {
  if (steps.length === 0) return steps
  const next = steps.slice()
  next[next.length - 1] = update(next[next.length - 1])
  return next
}

export default function App() {
  const [projects, setProjects] = useState<Project[]>([])
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)
  const [chats, setChats] = useState<Chat[]>([])
  const [activeChatId, setActiveChatId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [providers, setProviders] = useState<ProviderPublic[]>([])
  const [models, setModels] = useState<ModelEntry[]>([])
  const [extensions, setExtensions] = useState<ExtensionInfo[]>([])
  const [skills, setSkills] = useState<SkillInfo[]>([])
  const [mcpServers, setMcpServers] = useState<McpServerInfo[]>([])
  const [lspServers, setLspServers] = useState<LspServerInfo[]>([])
  const [chatExtensions, setChatExtensions] = useState<ChatExtensionsState | null>(null)
  const [chatSummary, setChatSummary] = useState<ChatSummary | null>(null)
  const [summaryBusy, setSummaryBusy] = useState(false)
  const [summaryError, setSummaryError] = useState<string | null>(null)
  const [modelId, setModelId] = useState('')
  const [live, setLive] = useState<LiveState | null>(null)
  const [steps, setSteps] = useState<RunStep[]>([])
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [failure, setFailure] = useState<FailureInfo | null>(null)
  const [retryStatus, setRetryStatus] = useState<RetryStatus | null>(null)
  const [bootError, setBootError] = useState<string | null>(null)
  const [projectsLoading, setProjectsLoading] = useState(true)
  const [chatsLoading, setChatsLoading] = useState(false)
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [rightSidebarOpen, setRightSidebarOpen] = useState(false)
  const [largeScreen, setLargeScreen] = useState(() => window.innerWidth > 860)
  useEffect(() => {
    const onResize = () => setLargeScreen(window.innerWidth > 860)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  const [showCreate, setShowCreate] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showExtensions, setShowExtensions] = useState(false)
  const [editChatTarget, setEditChatTarget] = useState<Chat | null>(null)
  const [deleteChatTarget, setDeleteChatTarget] = useState<Chat | null>(null)
  const [deleteProjectTarget, setDeleteProjectTarget] = useState<Project | null>(null)
  const [deleteSummaryTarget, setDeleteSummaryTarget] = useState(false)

  const activeChatIdRef = useRef<string | null>(null)
  const chatExtensionsSeq = useRef(0)
  const subscriptionRef = useRef<{ chatId: string; controller: AbortController; cancelled: boolean } | null>(null)

  useEffect(() => {
    activeChatIdRef.current = activeChatId
  }, [activeChatId])

  const refreshProviders = useCallback(async () => setProviders(await api.listProviders()), [])
  const refreshModels = useCallback(async () => setModels(await api.listModels()), [])
  const refreshExtensions = useCallback(async () => setExtensions(await api.listExtensions()), [])
  const refreshSkills = useCallback(async () => setSkills(await api.listSkills()), [])
  const refreshMcp = useCallback(async () => setMcpServers(await api.listMcpServers()), [])
  const refreshLsp = useCallback(async () => setLspServers(await api.listLspServers()), [])
  const refreshChatExtensions = useCallback(async (chatId: string) => {
    const seq = ++chatExtensionsSeq.current
    const state = await api.listChatExtensions(chatId)
    if (seq === chatExtensionsSeq.current && activeChatIdRef.current === chatId) {
      setChatExtensions(state)
    }
  }, [])

  const handleEvent = useCallback((event: AgentEvent) => {
    if (event.type === 'assistant_start') {
      setLive((current) =>
        current ? { ...current, content: '', reasoning: '', tools: [], step: event.step } : current
      )
      setSteps((current) => beginStep(current, event.step))
    } else if (event.type === 'step') {
      setLive((current) => (current ? { ...current, step: event.step } : current))
      setSteps((current) => beginStep(current, event.step))
    } else if (event.type === 'retry') {
      setFailure(null)
      setError(null)
      setRetryStatus({
        attempt: event.attempt,
        maxAttempts: event.maxAttempts,
        delayMs: event.delayMs,
        nextAt: event.nextAt,
        unlimited: event.unlimited,
        message: event.message,
        status: event.status,
        code: event.code,
        title: event.title,
        details: event.details,
        retryAfterMs: event.retryAfterMs,
        attempts: event.attempts,
        retryable: event.retryable
      })
    } else if (event.type === 'summary_start') {
      setSummaryBusy(true)
      setSummaryError(null)
    } else if (event.type === 'summary') {
      setSummaryBusy(false)
      setSummaryError(null)
      setChatSummary(event.summary)
    } else if (event.type === 'summary_error') {
      setSummaryBusy(false)
      setSummaryError(event.message)
    } else if (event.type === 'token') {
      setRetryStatus(null)
      setLive((current) => (current ? { ...current, content: current.content + event.text } : current))
      setSteps((current) =>
        updateLastStep(current, (step) => ({ ...step, content: step.content + event.text }))
      )
    } else if (event.type === 'reasoning') {
      setRetryStatus(null)
      setLive((current) => (current ? { ...current, reasoning: current.reasoning + event.text } : current))
    } else if (event.type === 'tool_start') {
      setRetryStatus(null)
      if (event.call.name !== 'update_plan') {
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
        setSteps((current) =>
          updateLastStep(current, (step) => ({
            ...step,
            tools: [
              ...step.tools,
              {
                id: event.call.id,
                name: event.call.name,
                arguments: event.call.arguments,
                status: 'running'
              }
            ]
          }))
        )
      }
    } else if (event.type === 'tool_end') {
      if (event.call.name !== 'update_plan') {
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
        setSteps((current) =>
          updateLastStep(current, (step) => ({
            ...step,
            tools: step.tools.map((tool) =>
              tool.id === event.call.id
                ? {
                    ...tool,
                    status: event.result.ok ? 'ok' : 'error',
                    durationMs: event.durationMs
                  }
                : tool
            )
          }))
        )
      }

      const chatId = activeChatIdRef.current
      if (chatId) {
        void api
          .listMessages(chatId)
          .then((list) => {
            if (activeChatIdRef.current !== chatId) return
            setMessages(list)
            setLive((current) => (current ? { ...current, content: '', tools: [] } : current))
          })
          .catch(() => {
            // live tool cards remain visible until the next refresh
          })
      }
    } else if (event.type === 'error') {
      setRetryStatus(null)
      setSummaryBusy(false)
      setError(event.error)
      setFailure({
        message: event.message || event.error,
        status: event.status,
        code: event.code,
        title: event.title,
        details: event.details,
        retryAfterMs: event.retryAfterMs,
        attempts: event.attempts,
        retryable: event.retryable
      })
      setSteps((current) => {
        const now = Date.now()
        return current.map((step) => (step.status === 'running' ? finishStep(step, 'error', now) : step))
      })
    } else if (event.type === 'done') {
      setRetryStatus(null)
      setSummaryBusy(false)
      setFailure(null)
      setSteps((current) => {
        const now = Date.now()
        return current.map((step) => (step.status === 'running' ? finishStep(step, 'done', now) : step))
      })
      if (event.aborted) setError('Stopped by user.')
    }
  }, [])

  const detachRun = useCallback(() => {
    const current = subscriptionRef.current
    if (!current) return
    current.cancelled = true
    current.controller.abort()
    subscriptionRef.current = null
  }, [])

  const attachRun = useCallback(
    async (chatId: string, preserveLive = false) => {
      detachRun()
      const controller = new AbortController()
      const subscription = { chatId, controller, cancelled: false }
      subscriptionRef.current = subscription
      if (!preserveLive) {
        setLive(null)
        setSteps([])
        setStreaming(false)
        setChatSummary(null)
        setSummaryBusy(false)
        setSummaryError(null)
      }
      setError(null)
      setFailure(null)
      setRetryStatus(null)

      try {
        const [list, savedSummary] = await Promise.all([
          api.listMessages(chatId),
          api.getChatSummary(chatId).catch(() => null)
        ])
        if (subscription.cancelled) return
        setMessages(list)
        setChatSummary(savedSummary)
        setMessagesLoading(false)
        const status = await api.getChatRun(chatId)
        if (subscription.cancelled || !status.active) return
        setStreaming(true)
        if (!preserveLive) setLive({ content: '', reasoning: '', tools: [], step: 0 })
        await api.streamChatEvents(
          chatId,
          (event) => {
            if (!subscription.cancelled) handleEvent(event)
          },
          controller.signal
        )
      } catch (caught) {
        if (!subscription.cancelled && !controller.signal.aborted) {
          setError(caught instanceof Error ? caught.message : String(caught))
        }
      } finally {
        if (!subscription.cancelled) {
          setStreaming(false)
          setLive(null)
          setSummaryBusy(false)
          setMessagesLoading(false)
          try {
            const [list, savedSummary] = await Promise.all([
              api.listMessages(chatId),
              api.getChatSummary(chatId).catch(() => null)
            ])
            if (!subscription.cancelled && activeChatIdRef.current === chatId) {
              setMessages(list)
              setChatSummary(savedSummary)
            }
          } catch {
            // the final state can be reloaded manually
          }
        }
        if (subscriptionRef.current === subscription) subscriptionRef.current = null
      }
    },
    [detachRun, handleEvent]
  )

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const [projectList, providerList, modelList, extensionList, skillList, mcpList, lspList] =
          await Promise.all([
            api.listProjects(),
            api.listProviders(),
            api.listModels(),
            api.listExtensions(),
            api.listSkills(),
            api.listMcpServers(),
            api.listLspServers()
          ])
        if (cancelled) return
        setProjects(projectList)
        setProviders(providerList)
        setModels(modelList)
        setExtensions(extensionList)
        setSkills(skillList)
        setMcpServers(mcpList)
        setLspServers(lspList)
        if (projectList.length) setActiveProjectId((current) => current ?? projectList[0].id)
      } catch (caught) {
        if (!cancelled) setBootError(caught instanceof Error ? caught.message : String(caught))
      } finally {
        if (!cancelled) setProjectsLoading(false)
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
      setChatsLoading(false)
      return
    }
    let cancelled = false
    setChatsLoading(true)
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
      .finally(() => {
        if (!cancelled) setChatsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [activeProjectId])

  useEffect(() => {
    if (!activeChatId) {
      detachRun()
      setMessages([])
      setLive(null)
      setSteps([])
      setStreaming(false)
      setMessagesLoading(false)
      setError(null)
      setFailure(null)
      setRetryStatus(null)
      setChatSummary(null)
      setSummaryBusy(false)
      setSummaryError(null)
      return
    }
    setMessagesLoading(true)
    void attachRun(activeChatId)
    return () => {
      detachRun()
    }
  }, [activeChatId, attachRun, detachRun])

  useEffect(() => {
    if (!activeChatId) {
      chatExtensionsSeq.current++
      setChatExtensions(null)
      return
    }
    setChatExtensions(null)
    void refreshChatExtensions(activeChatId).catch(() => {
      if (activeChatIdRef.current === activeChatId) setChatExtensions(null)
    })
    return () => {
      chatExtensionsSeq.current++
    }
  }, [activeChatId, refreshChatExtensions])

  useEffect(() => {
    const chat = chats.find((entry) => entry.id === activeChatId)
    const preferred =
      chat?.modelId && models.some((model) => model.id === chat.modelId) ? chat.modelId : models[0]?.id ?? ''
    setModelId(preferred)
  }, [activeChatId, chats, models])

  const activeProject = projects.find((project) => project.id === activeProjectId) ?? null
  const activeChat = chats.find((chat) => chat.id === activeChatId) ?? null

  const selectProject = (project: Project) => {
    setActiveProjectId(project.id)
    setSidebarOpen(false)
  }

  const selectChat = (chat: Chat) => {
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

  const saveChatDetails = async (chat: Chat, fields: { title: string; modelId: string | null }) => {
    const updated = await api.updateChat(chat.id, fields)
    setChats((current) => current.map((entry) => (entry.id === updated.id ? updated : entry)))
    if (activeChatIdRef.current === updated.id) {
      setModelId(updated.modelId ?? '')
    }
  }

  const removeChat = async (chat: Chat) => {
    try {
      await api.deleteChat(chat.id)
      const remaining = await api.listChats(chat.projectId)
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
    setError(null)
    setFailure(null)
    setRetryStatus(null)
    setSummaryBusy(false)
    setSummaryError(null)
    setLive({ content: '', reasoning: '', tools: [], step: 0 })
    setSteps([])
    setStreaming(true)

    const optimistic: Message = {
      id: `local-${Date.now()}`,
      chatId,
      role: 'user',
      content,
      toolCalls: null,
      toolCallId: null,
      modelId: null,
      durationMs: null,
      createdAt: Date.now()
    }
    setMessages((current) => [...current, optimistic])

    try {
      const started = await api.startChatRun(chatId, content, modelId)
      const title = started.title
      if (title) {
        setChats((current) => current.map((entry) => (entry.id === chatId ? { ...entry, title } : entry)))
      }
    } catch (caught) {
      if (activeChatIdRef.current === chatId) {
        setError(caught instanceof Error ? caught.message : String(caught))
        setStreaming(false)
        setLive(null)
        try {
          setMessages(await api.listMessages(chatId))
        } catch {
          // the final state can be reloaded manually
        }
      }
      return
    }

    if (activeChatIdRef.current !== chatId) return
    await attachRun(chatId, true)

    if (activeChatIdRef.current === chatId) {
      try {
        setChats(await api.listChats(projectId))
      } catch {
        // the chat list can be reloaded manually
      }
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

  const toggleChatExtension = async (kind: ExtensionKind, name: string, enabled: boolean) => {
    const chatId = activeChatId
    if (!chatId) return
    try {
      await api.setChatExtension(chatId, { kind, name, enabled })
      if (activeChatIdRef.current !== chatId) return
      await refreshChatExtensions(chatId)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    }
  }

  const saveSummary = async (text: string) => {
    const chatId = activeChatId
    if (!chatId) throw new Error('Select a chat first')
    const saved = await api.saveChatSummary(chatId, text)
    if (activeChatIdRef.current === chatId) {
      setChatSummary(saved)
      setSummaryError(null)
    }
  }

  const removeSummary = async () => {
    const chatId = activeChatId
    if (!chatId) return
    try {
      await api.deleteChatSummary(chatId)
      if (activeChatIdRef.current === chatId) {
        setChatSummary(null)
        setSummaryBusy(false)
        setSummaryError(null)
      }
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
        projectsLoading={projectsLoading}
        chatsLoading={chatsLoading}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onSelectProject={selectProject}
        onCreateProject={() => setShowCreate(true)}
        onDeleteProject={setDeleteProjectTarget}
        onSelectChat={selectChat}
        onCreateChat={createChat}
        onEditChat={setEditChatTarget}
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
        chatExtensions={chatExtensions}
        summary={chatSummary}
        summaryBusy={summaryBusy}
        summaryError={summaryError}
        live={live}
        streaming={streaming}
        steps={steps}
        loading={projectsLoading || chatsLoading || messagesLoading}
        error={error}
        failure={failure}
        retryStatus={retryStatus}
        onModelChange={setModelId}
        onToggleChatExtension={toggleChatExtension}
        onSaveSummary={saveSummary}
        onDeleteSummary={() => setDeleteSummaryTarget(true)}
        onDismissSummaryError={() => setSummaryError(null)}
        onSend={send}
        onStop={stop}
        onOpenSidebar={() => setSidebarOpen(true)}
        onEditChat={setEditChatTarget}
        rightSidebarOpen={rightSidebarOpen}
        onToggleRightSidebar={() => setRightSidebarOpen((open) => !open)}
      />

      {(rightSidebarOpen || largeScreen) && activeProject && (
        <RightSidebar project={activeProject} onClose={() => setRightSidebarOpen(false)} />
      )}

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
          skills={skills}
          mcpServers={mcpServers}
          lspServers={lspServers}
          projects={projects}
          models={models}
          activeProjectId={activeProjectId}
          onClose={() => {
            setShowExtensions(false)
            if (activeChatId) void refreshChatExtensions(activeChatId)
          }}
          onRefreshExtensions={refreshExtensions}
          onRefreshSkills={refreshSkills}
          onRefreshMcp={refreshMcp}
          onRefreshLsp={refreshLsp}
        />
      )}

      {editChatTarget && (
        <EditChatModal
          chat={editChatTarget}
          models={models}
          onClose={() => setEditChatTarget(null)}
          onSave={(fields) => saveChatDetails(editChatTarget, fields)}
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

      {deleteSummaryTarget && (
        <ConfirmModal
          title="Remove conversation summary"
          message="Older messages will be sent to the model again. The full transcript is still kept in this chat."
          confirmLabel="Remove summary"
          onClose={() => setDeleteSummaryTarget(false)}
          onConfirm={() => void removeSummary()}
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

function EditChatModal({
  chat,
  models,
  onClose,
  onSave
}: {
  chat: Chat
  models: ModelEntry[]
  onClose: () => void
  onSave: (fields: { title: string; modelId: string | null }) => Promise<void>
}) {
  const [title, setTitle] = useState(chat.title)
  const [modelId, setModelId] = useState(chat.modelId ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  return (
    <Modal title="Edit chat" onClose={onClose}>
      {error && <div className="error-banner">{error}</div>}
      <form
        onSubmit={(event) => {
          event.preventDefault()
          if (!title.trim()) return
          setBusy(true)
          setError(null)
          void onSave({ title: title.trim(), modelId: modelId || null })
            .then(onClose)
            .catch((caught) => setError(caught instanceof Error ? caught.message : String(caught)))
            .finally(() => setBusy(false))
        }}
      >
        <label className="field">
          <span>Title</span>
          <input value={title} onChange={(event) => setTitle(event.target.value)} autoFocus />
        </label>
        <label className="field">
          <span>Model</span>
          <select value={modelId} onChange={(event) => setModelId(event.target.value)}>
            <option value="">Use the first available model</option>
            {models.map((model) => (
              <option value={model.id} key={model.id}>
                {model.name || model.modelId}
                {model.providerName ? ` · ${model.providerName}` : ''}
              </option>
            ))}
          </select>
        </label>
        <p className="muted small">
          The model is used for new messages in this chat. Existing messages keep their original model.
        </p>
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={busy || !title.trim()}>
            {busy ? 'Saving…' : 'Save chat'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
