export interface Project {
  id: string
  name: string
  path: string
  createdAt: string
}

export interface Chat {
  id: string
  projectId: string
  title: string
  createdAt: string
  updatedAt: string
}

export interface Message {
  id: string
  chatId: string
  role: 'user' | 'assistant' | 'system'
  content: string
  createdAt: string
  error?: boolean
}

export interface Provider {
  id: string
  name: string
  baseUrl: string
  apiKey: string
  keyPreview?: string
}

export interface ModelEntry {
  id: string
  model: string
  displayName?: string
  providerId: string
  providerName: string
}
