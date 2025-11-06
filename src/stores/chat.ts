import { defineStore } from 'pinia'
import type { ChatMessage } from '@/types/chat'
import { createAiClient } from '@/services/aiClient'

interface ChatState {
  messages: ChatMessage[]
  isLoading: boolean
  error: string | null
}

const STORAGE_KEY = 'ai_chat_messages'

/**
 * 生成唯一消息ID（无需外部依赖）。
 * - 优先使用 `crypto.randomUUID()`（大多数现代浏览器支持）
 * - 回退到时间戳 + 随机片段组合，避免碰撞
 */
function genId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID()
    }
  } catch {
    // 某些环境可能禁用 crypto，忽略错误
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * 聊天 Store：管理消息、加载状态与错误
 * - 支持多轮上下文（持续累积 messages）
 * - 本地持久化到 localStorage
 */
export const useChatStore = defineStore('chat', {
  state: (): ChatState => ({
    messages: [],
    isLoading: false,
    error: null,
  }),
  actions: {
    /**
     * 从 localStorage 初始化历史消息。
     */
    initFromStorage() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (raw) {
          const parsed = JSON.parse(raw) as ChatMessage[]
          this.messages = Array.isArray(parsed) ? parsed : []
        }
      } catch {
        // 忽略解析错误
      }
    },

    /**
     * 将当前消息持久化到 localStorage。
     */
    persist() {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.messages))
      } catch {
        // 存储可能失败（配额、隐私模式），忽略
      }
    },

    /**
     * 清空聊天历史。
     */
    clear() {
      this.messages = []
      this.error = null
      this.persist()
    },

    /**
     * 发送一条用户消息，并流式接收助手回复。
     * @param text 用户输入文本
     */
    async send(text: string) {
      if (!text || this.isLoading) return
      this.isLoading = true
      this.error = null

      const userMsg: ChatMessage = {
        id: genId(),
        role: 'user',
        content: text,
        createdAt: Date.now(),
      }
      this.messages.push(userMsg)
      this.persist()

      // 预先插入一条空的助手消息，准备填充流式内容
      const assistantMsg: ChatMessage = {
        id: genId(),
        role: 'assistant',
        content: '',
        createdAt: Date.now(),
      }
      this.messages.push(assistantMsg)
      this.persist()

      const client = createAiClient()
      try {
        await client.chatStream(this.messages, { max_tokens: 1024, temperature: 0.7 }, {
          onChunk: (delta: string) => {
            assistantMsg.content += delta
            // 使用对象引用确保响应式更新
            this.persist()
          },
          onComplete: () => {
            this.isLoading = false
            this.persist()
          },
          onError: (err: Error) => {
            this.isLoading = false
            this.error = err.message
            this.persist()
          },
        })
      } catch (e) {
        this.isLoading = false
        this.error = e instanceof Error ? e.message : String(e)
      }
    },
  },
})