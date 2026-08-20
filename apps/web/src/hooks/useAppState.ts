import { useState, useCallback } from 'react';
import { api } from '../utils/api';
import { Project, Chat, Message } from '../types/api';

export function useAppState() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [chats, setChats] = useState<Chat[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadProjects = useCallback(async () => {
    try {
      const data = await api.getProjects();
      setProjects(data);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  const loadChats = useCallback(async (projectId: string) => {
    try {
      const data = await api.getChats(projectId);
      setChats(data);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  const loadMessages = useCallback(async (chatId: string) => {
    try {
      const data = await api.getMessages(chatId);
      setMessages(data);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  const selectProject = useCallback(async (projectId: string) => {
    setSelectedProjectId(projectId);
    setSelectedChatId(null);
    setMessages([]);
    await loadChats(projectId);
  }, [loadChats]);

  const selectChat = useCallback(async (chatId: string) => {
    setSelectedChatId(chatId);
    await loadMessages(chatId);
  }, [loadMessages]);

  const createProject = useCallback(async (name: string, rootDirectory: string) => {
    const result = await api.createProject(name, rootDirectory);
    await loadProjects();
    return result.id;
  }, [loadProjects]);

  const createChat = useCallback(async (projectId: string, title: string) => {
    const result = await api.createChat(projectId, title);
    await loadChats(projectId);
    return result.id;
  }, [loadChats]);

  const deleteProject = useCallback(async (projectId: string) => {
    await api.deleteProject(projectId);
    if (selectedProjectId === projectId) {
      setSelectedProjectId(null);
      setSelectedChatId(null);
      setMessages([]);
    }
    await loadProjects();
  }, [selectedProjectId, loadProjects]);

  const deleteChat = useCallback(async (chatId: string) => {
    await api.deleteChat(chatId);
    if (selectedChatId === chatId) {
      setSelectedChatId(null);
      setMessages([]);
    }
    if (selectedProjectId) {
      await loadChats(selectedProjectId);
    }
  }, [selectedChatId, selectedProjectId, loadChats]);

  const sendMessage = useCallback(async (message: string) => {
    if (!selectedProjectId || !selectedChatId) return;
    setLoading(true);
    setError(null);
    try {
      // Optimistically add user message
      const optimistic: Message = {
        id: `temp-${Date.now()}`,
        chat_id: selectedChatId,
        role: 'user',
        content: message,
        created_at: new Date().toISOString()
      };
      setMessages(prev => [...prev, optimistic]);

      const result = await api.startRun(selectedChatId, selectedProjectId, message);
      return result.runId;
    } catch (err) {
      setError((err as Error).message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [selectedProjectId, selectedChatId]);

  return {
    projects,
    selectedProjectId,
    selectedChatId,
    messages,
    chats,
    loading,
    error,
    setError,
    loadProjects,
    loadChats,
    loadMessages,
    selectProject,
    selectChat,
    createProject,
    createChat,
    deleteProject,
    deleteChat,
    sendMessage
  };
}