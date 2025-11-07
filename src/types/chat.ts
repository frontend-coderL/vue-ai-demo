export type ChatRole = 'system' | 'user' | 'assistant'

export interface ChatMessage {
  id: string
  role: ChatRole
  content: string
  createdAt: number
}

export interface SendOptions {
  max_tokens?: number
  temperature?: number
}