import { useCallback, useEffect, useRef, useState } from 'react'
import * as api from './api'
import type { Chat, Message, ModelEntry, Plan, Preview, Project, Activity, Question } from './types'
import { DialogsProvider, useDialogs } from './dialogs'
import { ToastProvider, useToast } from './toast'
import { Header } from './components/Header'
import { Sidebar } from './components/Sidebar'
import { RightSidebar } from './components/RightSidebar'
import { PreviewSidebar } from './components/PreviewSidebar'
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
  const [previews, setPreviews] = useState<Record<string, Preview>>({})
  const [questions, setQuestions] = useState<Record<string, Question[]>>({})

  const [activeProjectId, setActiveProjectId] = useState<string | null>(() => { try { return localStorage.getItem(LS_PROJECT) } catch { return null } })
  const [activeChatId, setActiveChatId] = useState<string | null>(() => { try { return localStorage.getItem(LS_CHAT) } catch { return null } })
  const [selectedModelId, setSelectedModelId] = useState<string | null>(() => { try { return localStorage.getItem(LS_MODEL) } catch { return null } })

  const [sidebarOpen, setSidebarOpen] = useState(() => { try { return window.matchMedia('(min-width: 900px)').matches } catch { return true } })
  const [rsbOpen, setRsbOpen] = useState(() => { try { return window.matchMedia('(min-width: 1200px)').matches } catch { return true } })
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [addProjectOpen, setAddProjectOpen] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [showPreviewBanner, setShowPreviewBanner] = useState(false)
  const previewBannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
  const [activities, setActivities] = useState<Activity[]>([])
  const subsRef = useRef(new Map<string, AbortController>())
  const activeChatIdRef = useRef<string | null>(null)
  const activeProjectIdRef = useRef<string | null>(null)
  const skipLoadForRef = useRef<string | null>(null)
  const creatingChatRef = useRef(false)
  const sendingRef = useRef<Set<string>>(new Set())

  const activeProject = projects.find((p) => p.id === activeProjectId) ?? null
  const activeChat = chats.find((c) => c.id === activeChatId) ?? null

  useEffect(() => {
    activeChatIdRef.current = activeChatId
  }, [activeChatId])

  useEffect(() => {
    activeProjectIdRef.current = activeProjectId
  }, [activeProjectId])

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
    try {
      if (activeProjectId) localStorage.setItem(LS_PROJECT, activeProjectId)
      else localStorage.removeItem(LS_PROJECT)
    } catch {}
  }, [activeProjectId])

  useEffect(() => {
    try {
      if (activeChatId) localStorage.setItem(LS_CHAT, activeChatId)
      else localStorage.removeItem(LS_CHAT)
    } catch {}
  }, [activeChatId])

  useEffect(() => {
    try {
      if (selectedModelId) localStorage.setItem(LS_MODEL, selectedModelId)
      else localStorage.removeItem(LS_MODEL)
    } catch {}
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

  // load the chat's preview (per chat like plan, actively per chat)
  useEffect(() => {
    if (!activeChatId) return
    let cancelled = false
    api
      .getChatPreview(activeChatId)
      .then((preview) => {
        if (cancelled) return
        setPreviews((prev) => {
          const next = { ...prev }
          if (preview) next[activeChatId] = preview
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

  // load activities for the chat (persisted per chat like plan)
  useEffect(() => {
    if (!activeChatId) return
    let cancelled = false
    api
      .listActivities(activeChatId)
      .then((list) => {
        if (cancelled) return
        setActivities((prev) => {
          const other = prev.filter((a) => a.chatId !== activeChatId)
          return [...other, ...list]
        })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChatId])

  // load questions for the chat
  useEffect(() => {
    if (!activeChatId) return
    let cancelled = false
    api
      .listQuestions(activeChatId)
      .then((list) => {
        if (cancelled) return
        setQuestions((prev) => ({ ...prev, [activeChatId]: list }))
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
      const pendingTools = new Map<string, { name: string; args: Record<string, unknown> }>()
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
            onTool: (tool) => {
              const { callId, name, args } = tool
              const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args
              pendingTools.set(callId, { name, args: parsedArgs as Record<string, unknown> })
              const activity: Activity = {
                id: callId,
                chatId,
                toolType: name as Activity['toolType'],
                toolCallId: callId,
                args: parsedArgs as Record<string, unknown>,
                summary: '',
                timestamp: new Date().toISOString(),
                expanded: false
              }
              setActivities((prev) => [...prev, activity])
            },
            onToolResult: (result) => {
              const { callId, ok, summary, result: fullResult } = result as { callId: string; ok: boolean; summary: string; result?: string }
              const pending = pendingTools.get(callId)
              pendingTools.delete(callId)
              if (pending) {
                setActivities((prev) =>
                  prev.map((a) =>
                    a.toolCallId === callId
                      ? { ...a, summary, ok, result: fullResult ?? summary }
                      : a
                  )
                )
              }
            },
            onPlan: (plan) => {
              setPlans((prev) => ({ ...prev, [chatId]: plan }))
            },
            onQuestion: (question) => {
              setQuestions((prev) => {
                const list = prev[chatId] ?? []
                const idx = list.findIndex((q) => q.id === question.id)
                const nextList = idx >= 0 ? list.map((q) => (q.id === question.id ? question : q)) : [...list, question]
                return { ...prev, [chatId]: nextList }
              })
            },
            onChatTitle: (data) => {
              setChats((prev) =>
                prev.map((c) =>
                  c.id === data.chatId ? { ...c, title: data.title, seq: data.seq ?? c.seq, updatedAt: new Date().toISOString() } : c
                )
              )
            },
            onPreview: (preview) => {
              setPreviews((prev) => ({ ...prev, [chatId]: preview }))
              // show Preview Live card at bottom for 2s like delete-chat toast, active per chat
              if (preview.chatId === activeChatIdRef.current) {
                setShowPreviewBanner(true)
                if (previewBannerTimerRef.current) clearTimeout(previewBannerTimerRef.current)
                previewBannerTimerRef.current = setTimeout(() => setShowPreviewBanner(false), 2000)
                // auto-open preview when AI calls it after final task complete for the active chat
                setPreviewOpen(true)
              }
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
          // fallback: ensure chat title/seq synced from server even if SSE chat_title missed
          try {
            const pid = activeProjectIdRef.current
            if (pid) {
              const list = await api.listChats(pid)
              if (list.some((c) => c.id === chatId)) setChats(list)
            }
          } catch {}
          try {
            const plan = await api.getPlan(chatId)
            setPlans((prev) => {
              const next = { ...prev }
              if (plan) next[chatId] = plan
              else delete next[chatId]
              return next
            })
          } catch {}
          try {
            const qs = await api.listQuestions(chatId)
            setQuestions((prev) => ({ ...prev, [chatId]: qs }))
          } catch {}
          try {
            const acts = await api.listActivities(chatId)
            setActivities((prev) => {
              const other = prev.filter((a) => a.chatId !== chatId)
              return [...other, ...acts]
            })
          } catch {}
          try {
            const preview = await api.getChatPreview(chatId)
            setPreviews((prev) => {
              const next = { ...prev }
              if (preview) next[chatId] = preview
              else delete next[chatId]
              return next
            })
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
    const { confirmed, checked: deleteFolder } = await confirm({
      title: `Delete "${project.name}"?`,
      message: 'All chats and messages in this project will be permanently removed.',
      danger: true,
      confirmText: 'Delete',
      checkboxLabel: 'Also delete project folder from disk',
      checkboxWarning: 'This will permanently delete all files and folders inside the project directory. This action cannot be undone!',
      checkboxInitialChecked: false
    })
    if (!confirmed) return
    try {
      await api.deleteProject(project.id, { deleteFolder })
      setProjects((prev) => prev.filter((p) => p.id !== project.id))
      // clean local state for deleted project's chats
      const deletedChatIds = new Set(chats.filter((c) => c.projectId === project.id).map((c) => c.id))
      if (deletedChatIds.size > 0) {
        setChats((prev) => prev.filter((c) => !deletedChatIds.has(c.id)))
        setActivities((prev) => prev.filter((a) => !deletedChatIds.has(a.chatId)))
        setPlans((prev) => {
          const n = { ...prev }
          for (const id of deletedChatIds) delete n[id]
          return n
        })
        setPreviews((prev) => {
          const n = { ...prev }
          for (const id of deletedChatIds) delete n[id]
          return n
        })
        setQuestions((prev) => {
          const n = { ...prev }
          for (const id of deletedChatIds) delete n[id]
          return n
        })
      }
      if (activeProjectId === project.id) {
        setActiveProjectId(null)
        setActiveChatId(null)
        setMessages([])
      }
      toast(deleteFolder ? 'Project and folder deleted' : 'Project deleted', 'success')
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
      setActivities((prev) => prev.filter((a) => a.chatId !== chat.id))
      setPlans((prev) => {
        const n = { ...prev }
        delete n[chat.id]
        return n
      })
      setPreviews((prev) => {
        const n = { ...prev }
        delete n[chat.id]
        return n
      })
      setQuestions((prev) => {
        const n = { ...prev }
        delete n[chat.id]
        return n
      })
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

  function stripInterrupted(content: string): string {
    let c = content
    c = c.replace(/\n\n_\[stopped\]_\s*$/g, '')
    c = c.replace(/\n\n_\[stream interrupted:[^\]]*\]_\s*$/g, '')
    c = c.replace(/\n\n_\[truncated[^\]]*\]_\s*$/g, '')
    return c.trimEnd()
  }
  function isContinueKeyword(text: string): boolean {
    const t = text.trim().toLowerCase()
    return /^(continue|resume|proceed|keep going|go on|cont\.?|continue please|please continue)[.!]*$/.test(t)
  }

  async function handleContinue(extraContent?: string) {
    const chatId = activeChatId
    if (!chatId || !selectedModelId) {
      if (!selectedModelId) toast('No model selected. Add one in Settings.', 'error')
      return
    }
    if (sendingRef.current.has(chatId)) return
    const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant')
    if (!lastAssistant) {
      toast('No previous response to continue', 'error')
      return
    }
    const stripped = stripInterrupted(lastAssistant.content)
    // Pure continue (no extraContent) → update in place, hide old bubble to avoid duplication
    const isPure = !extraContent || !extraContent.trim() || isContinueKeyword(extraContent)
    if (isPure) {
      // Optimistically hide interrupted bubble; streaming will show merged content
      setMessages((prev) => prev.filter((m) => m.id !== lastAssistant.id))
      setStreams((prev) => ({ ...prev, [chatId]: stripped }))
    } else {
      const tempUserMsg: Message = {
        id: 'tmp-' + Date.now(),
        chatId,
        role: 'user',
        content: extraContent,
        createdAt: new Date().toISOString()
      }
      setMessages((prev) => [...prev, tempUserMsg])
      setStreams((prev) => ({ ...prev, [chatId]: prev[chatId] ?? '' }))
    }
    sendingRef.current.add(chatId)
    try {
      if (isPure) {
        await api.continueChat(chatId, '', selectedModelId)
      } else {
        await api.continueChat(chatId, extraContent, selectedModelId)
      }
      // For pure continue preserve plan/activities so AI picks up where it left off
      if (!isPure) {
        // For "any other" with extra instruction but still continuation, preserve if was interrupted
        const wasInterrupted = /\n\n_\[stopped\]_\s*$/.test(lastAssistant.content) || /\n\n_\[stream interrupted:/.test(lastAssistant.content) || !!(lastAssistant as any).error
        if (!wasInterrupted) {
          setPlans((prev) => {
            const n = { ...prev }
            delete n[chatId]
            return n
          })
          setActivities((prev) => prev.filter((a) => a.chatId !== chatId))
        }
      }
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
    } finally {
      sendingRef.current.delete(chatId)
    }
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

    // If user typed pure "continue" and there's a previous assistant, delegate to continuation flow
    // so it resumes exactly where it ended without creating a new user bubble.
    if (chatId && isContinueKeyword(content)) {
      const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant')
      if (lastAssistant) {
        return handleContinue(content)
      }
    }

    // Prevent concurrent sends for the same chat
    if (chatId && sendingRef.current.has(chatId)) return

    // Capture whether previous assistant was interrupted for seamless "any other" continuation
    const prevAssistantForSend = chatId ? [...messages].reverse().find((m) => m.role === 'assistant') : null
    const prevWasInterruptedForSend = prevAssistantForSend
      ? /\n\n_\[stopped\]_\s*$/.test(prevAssistantForSend.content) ||
        /\n\n_\[stream interrupted:/.test(prevAssistantForSend.content) ||
        !!(prevAssistantForSend as any).error
      : false

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

    // Mark this chat as sending
    if (chatId) sendingRef.current.add(chatId)

    setStreams((prev) => ({ ...prev, [chatId]: prev[chatId] ?? '' }))

    try {
      await api.sendMessage(chatId, content, selectedModelId)
      // Reset plan + activities for this chat so the next prompt starts
      // fresh from Understand → Explore → Planning → Executing.
      // Without this, hasExplore stays true and old plan (done) makes UI
      // show stale "Executing 7/6" instead of the fresh flow.
      // Do it after send succeeds so a failed send doesn't lose the old plan.
      // But if previous was interrupted and user said "any other", keep for seamless continuation.
      if (!prevWasInterruptedForSend) {
        setPlans((prev) => {
          const n = { ...prev }
          delete n[chatId]
          return n
        })
        setActivities((prev) => prev.filter((a) => a.chatId !== chatId))
      } else {
        // Clean stale stopped marker from displayed message optimistically
        if (prevAssistantForSend) {
          const cleaned = stripInterrupted(prevAssistantForSend.content)
          if (cleaned !== prevAssistantForSend.content) {
            setMessages((prev) => prev.map((m) => (m.id === prevAssistantForSend.id ? { ...m, content: cleaned, error: undefined } : m)))
          }
        }
      }
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
    } finally {
      if (chatId) sendingRef.current.delete(chatId)
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

  const handleAnswerQuestion = useCallback(
    async (questionId: string, answer: string) => {
      const chatId = activeChatId
      if (!chatId) return
      try {
        const updated = await api.answerQuestion(chatId, questionId, answer)
        setQuestions((prev) => {
          const list = prev[chatId] ?? []
          return { ...prev, [chatId]: list.map((q) => (q.id === updated.id ? updated : q)) }
        })
      } catch (e: any) {
        toast(e.message, 'error')
        throw e
      }
    },
    [activeChatId, toast]
  )

  const togglePreview = useCallback(() => setPreviewOpen((v) => !v), [])
  const toggleRight = useCallback(() => setRsbOpen((v) => !v), [])

  const activePreview = activeChat ? previews[activeChat.id] ?? null : null
  const hasPreview = !!activePreview

  // hide preview banner after 2s like delete-chat toast, cleanup timer on unmount/chat switch
  useEffect(() => {
    return () => {
      if (previewBannerTimerRef.current) clearTimeout(previewBannerTimerRef.current)
    }
  }, [])
  useEffect(() => {
    // when active chat changes, hide any lingering banner (active per chat)
    setShowPreviewBanner(false)
    if (previewBannerTimerRef.current) {
      clearTimeout(previewBannerTimerRef.current)
      previewBannerTimerRef.current = null
    }
  }, [activeChat?.id])

  // ---- render ----
  return (
    <div className="app">
      <Header
        onMenu={() => setSidebarOpen((v) => !v)}
        onToggleRight={toggleRight}
        onTogglePreview={togglePreview}
        hasPreview={hasPreview}
        previewPort={activePreview?.port ?? null}
      />
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
            questions={activeChat ? questions[activeChat.id] ?? [] : []}
            onAnswerQuestion={handleAnswerQuestion}
            plan={activeChat ? plans[activeChat.id] ?? null : null}
            activities={activeChat ? activities.filter((a) => a.chatId === activeChat.id) : []}
            onContinue={() => handleContinue()}
          />
        </main>
        <RightSidebar
          open={rsbOpen}
          activeProject={activeProject}
          plan={activeChat ? plans[activeChat.id] ?? null : null}
          activities={activeChat ? activities.filter((a) => a.chatId === activeChat.id) : []}
          streaming={activeChat ? streams[activeChat.id] !== undefined : false}
          onClose={() => setRsbOpen(false)}
        />
        <PreviewSidebar
          open={previewOpen}
          activeProject={activeProject ? { id: activeProject.id, path: activeProject.path } : null}
          activeChatId={activeChat?.id ?? null}
          chatPreview={activeChat ? previews[activeChat.id] ?? null : null}
          onClose={() => setPreviewOpen(false)}
        />
      </div>

      {showPreviewBanner && activePreview && (
        <div
          style={{
            position: 'fixed',
            bottom: 18,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 75,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 16px',
            background: 'var(--surface-2)',
            border: '1px solid #22c55e30',
            borderLeft: '3px solid #22c55e',
            borderRadius: 10,
            boxShadow: '0 12px 32px rgba(0,0,0,0.75)',
            maxWidth: 'calc(100vw - 24px)',
            animation: 'rise 0.18s ease',
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: '#22c55e',
              boxShadow: '0 0 8px rgba(34,197,94,0.65)',
              flexShrink: 0,
            }}
          />
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap' }}>Preview Live</span>
          <span
            style={{
              fontSize: 12,
              color: 'var(--text-dim)',
              fontFamily: 'ui-monospace, monospace',
              background: 'var(--btn)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              padding: '2px 6px',
            }}
          >
            :{activePreview.port}
          </span>
          <span style={{ fontSize: 11, color: 'var(--text-faint)', marginLeft: 2, display: 'none' }} className="hide-mobile">
            active per chat
          </span>
          <button className="btn btn-primary" style={{ padding: '7px 14px', fontSize: 12.5, marginLeft: 8, whiteSpace: 'nowrap' }} onClick={() => setPreviewOpen(true)}>
            Open Preview
          </button>
        </div>
      )}

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
