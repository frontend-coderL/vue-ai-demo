<script setup lang="ts">
// 组件选项：设置多词组件名，满足 eslint 的 multi-word 规则
defineOptions({ name: 'ChatPage' })
import { onMounted, ref, nextTick, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useChatStore } from '@/stores/chat'

// 输入框引用，便于发送后重新聚焦
const inputRef = ref<HTMLTextAreaElement | null>(null)
const text = ref('')
// 列表滚动容器引用，替代通过 id 查询，确保响应式
const scrollRef = ref<HTMLDivElement | null>(null)

const chat = useChatStore()
const { messages, isLoading, error } = storeToRefs(chat)

/**
 * 初始化：加载历史记录并确保滚动到最新消息。
 */
onMounted(async () => {
  chat.initFromStorage()
  await nextTick()
  scrollToBottom()
})

/**
 * 发送当前输入文本，支持多轮对话。
 * - 清空输入并重新聚焦
 * - 等待下一次DOM更新后滚动到底部
 */
async function handleSend() {
  const value = text.value.trim()
  text.value = ''
  if (!value) return
  await chat.send(value)
  await nextTick()
  scrollToBottom()
  inputRef.value?.focus()
}

/**
 * 处理键盘回车发送（Shift+Enter 换行）。
 */
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSend()
  }
}

/**
 * 滚动到消息列表底部，便于看到最新回复。
 */
function scrollToBottom() {
  const el = scrollRef.value
  if (el) {
    el.scrollTop = el.scrollHeight
  }
}

/**
 * 监听消息变化（包含流式增量），在视图更新后自动滚动到底部。
 * 使用 flush: 'post' 保证在 DOM 更新后执行；deep 监听对象内部的 content 变化。
 */
watch(
  messages,
  async () => {
    await nextTick()
    scrollToBottom()
  },
  { deep: true, flush: 'post' },
)
</script>

<template>
  <div class="h-full w-full flex items-center justify-center">
    <div class="flex flex-col h-full w-[800px]">
      <!-- 顶部：历史消息列表 -->
      <div ref="scrollRef" class="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
        <template v-if="messages.length">
          <div
            v-for="m in messages"
            :key="m.id"
            class="flex"
            :class="m.role === 'user' ? 'justify-end' : 'justify-start'"
          >
            <div
              class="max-w-[80%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap"
              :class="
                m.role === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-900 border border-gray-200'
              "
            >
              {{ m.content }}
            </div>
          </div>
        </template>
        <template v-else>
          <div class="text-center text-gray-500">开始对话吧，输入问题并发送～</div>
        </template>

        <!-- 加载提示（打字机效果由流式更新实现） -->
        <div v-if="isLoading" class="text-xs text-gray-500">AI 正在回复...</div>

        <!-- 错误提示 -->
        <div
          v-if="error"
          class="mt-2 rounded border border-red-300 bg-red-50 p-2 text-xs text-red-700"
        >
          {{ error }}
        </div>
      </div>

      <!-- 底部：输入框与发送按钮 -->
      <div class="border-t border-gray-200 bg-white p-3">
        <div class="flex items-end gap-2">
          <textarea
            ref="inputRef"
            v-model="text"
            @keydown="onKeydown"
            placeholder="Shift+Enter 换行，Enter 发送"
            rows="3"
            class="flex-1 resize-y rounded border border-gray-300 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            :disabled="isLoading || !text.trim()"
            @click="handleSend"
            class="rounded bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            发送
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped></style>
