import type { ChatMessage, SendOptions } from '@/types/chat'

export interface StreamCallbacks {
  onChunk: (text: string) => void
  onComplete: () => void
  onError: (err: Error) => void
}

export interface IAiClient {
  chatStream: (
    messages: ChatMessage[],
    options: SendOptions,
    callbacks: StreamCallbacks,
  ) => Promise<void>
}

/**
 * 将通用 ChatMessage 转换为 LongCat OpenAI兼容API消息格式。
 * 保持未来可拓展其他厂商（OpenAI、Anthropic）的一致性。
 */
function toLongCatMessages(messages: ChatMessage[]) {
  return messages.map((m) => ({ role: m.role, content: m.content }))
}

/**
 * LongCat 客户端实现（OpenAI兼容接口）
 * - 支持 SSE 流式返回，解析 data: 行内 JSON 块
 * - 通过 Vite 环境变量注入 API Key 与模型
 */
export class LongCatClient implements IAiClient {
  /**
   * 发起聊天，并以流式解析返回内容，实现打字机效果。
   * @param messages 历史消息（包含多轮上下文）
   * @param options 采样与token上限配置
   * @param callbacks 流式回调：onChunk、onComplete、onError
   */
  async chatStream(
    messages: ChatMessage[],
    options: SendOptions,
    callbacks: StreamCallbacks,
  ): Promise<void> {
    const apiKey = import.meta.env.VITE_LONGCAT_API_KEY
    const baseURL = import.meta.env.VITE_LONGCAT_BASE_URL
    const model = import.meta.env.VITE_LONGCAT_MODEL

    if (!apiKey) {
      callbacks.onError(new Error('缺少 LongCat API Key，请在 .env 设置 VITE_LONGCAT_API_KEY'))
      return
    }

    const payload = {
      model,
      messages: toLongCatMessages(messages),
      stream: true,
      max_tokens: options?.max_tokens ?? 512,
      temperature: options?.temperature ?? 0.7,
    }

    const url = `${baseURL}/openai/v1/chat/completions`

    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
      })

      if (!resp.ok) {
        const text = await resp.text()
        throw new Error(`接口错误 ${resp.status}: ${text}`)
      }

      const reader = resp.body?.getReader()
      if (!reader) {
        throw new Error('浏览器不支持流式读取或响应体为空')
      }

      // 用于合并SSE流块，处理跨块JSON解析
      const decoder = new TextDecoder('utf-8')
      let buffer = ''

      // 逐块读取SSE流，解析 data: 行
      while (true) {
        const { value, done } = await reader.read()
        if (done) break

        // 合并当前块到缓冲区
        buffer += decoder.decode(value, { stream: true })

        // SSE通常以\n\n分隔事件，但也需兼容单行
        const parts = buffer.split(/\n\n|\r\n\r\n/) // 事件分块
        // 保留最后一块作为未完成缓冲
        buffer = parts.pop() || ''

        for (const part of parts) {
          const lines = part.split(/\n|\r\n/)
          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed.startsWith('data:')) continue
            const dataStr = trimmed.replace(/^data:\s*/, '')
            if (dataStr === '[DONE]') {
              callbacks.onComplete()
              continue
            }
            try {
              const json = JSON.parse(dataStr)
              const delta = json?.choices?.[0]?.delta
              const content = delta?.content ?? ''
              if (typeof content === 'string' && content.length > 0) {
                callbacks.onChunk(content)
              }
            } catch (err) {
              // 流段可能包含非标准行，忽略解析错误但不中断
              console.warn('SSE 解析失败片段:', dataStr)
            }
          }
        }
      }

      // 处理残留缓冲（可能的最后事件）
      if (buffer.trim().length > 0) {
        const lines = buffer.split(/\n|\r\n/)
        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed.startsWith('data:')) continue
          const dataStr = trimmed.replace(/^data:\s*/, '')
          if (dataStr === '[DONE]') {
            callbacks.onComplete()
            continue
          }
          try {
            const json = JSON.parse(dataStr)
            const delta = json?.choices?.[0]?.delta
            const content = delta?.content ?? ''
            if (typeof content === 'string' && content.length > 0) {
              callbacks.onChunk(content)
            }
          } catch {
            // 忽略尾部解析错误
          }
        }
      }
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e))
      callbacks.onError(err)
    }
  }
}

/**
 * 工厂方法：当前默认返回 LongCat 客户端；
 * 未来可根据 provider 字段切换到其他模型提供方。
 */
export function createAiClient(): IAiClient {
  return new LongCatClient()
}
