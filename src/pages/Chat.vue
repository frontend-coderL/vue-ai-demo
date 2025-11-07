<script setup lang="ts">
// 组件选项：设置多词组件名，满足 eslint 的 multi-word 规则
defineOptions({ name: 'ChatPage' })
import { onMounted, ref, nextTick, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useChatStore } from '@/stores/chat'
import { renderMarkdownToSafeHtml, textToSafeHtml } from '@/utils/markdown'

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
  <!-- 背景：柔和渐变，提升整体质感 -->
  <div class="h-full w-full bg-gradient-to-br from-slate-50 to-slate-100 box-border">
    <!-- 居中容器：大屏居中显示，移动端自适应 -->
    <div class="mx-auto flex h-full max-w-3xl flex-col">
      <!-- 顶部栏：标题与清空按钮 -->
      <div class="sticky top-0 z-10 border-b border-slate-200 bg-white/80 px-4 py-3 backdrop-blur">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <!-- 简单圆形头像标识 -->
            <div
              class="h-8 w-8 rounded-full bg-blue-600/90 text-white grid place-items-center text-sm font-semibold"
            >
              AI
            </div>
            <h1 class="text-base font-semibold text-slate-900">AI Chat</h1>
          </div>
          <button
            class="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700 shadow-sm hover:bg-slate-50 active:scale-[0.98]"
            @click="chat.clear()"
          >
            清空历史
          </button>
        </div>
      </div>

      <!-- 消息列表：卡片气泡样式，更优雅的间距与阴影 -->
      <div ref="scrollRef" class="flex-1 flex overflow-y-auto">
        <div class="p-4 space-y-6">
          <template v-if="messages.length">
            <div
              v-for="m in messages"
              :key="m.id"
              class="flex items-start gap-3"
              :class="m.role === 'user' ? 'flex-row-reverse' : ''"
            >
              <!-- 助手头像 / 用户头像 -->
              <div
                v-if="m.role === 'assistant'"
                class="h-8 w-8 shrink-0 rounded-full bg-slate-900 text-white grid place-items-center text-xs font-semibold"
              >
                AI
              </div>
              <div
                v-else
                class="h-8 w-8 shrink-0 rounded-full bg-blue-600 text-white grid place-items-center text-xs font-semibold"
              >
                我
              </div>

              <!-- 气泡 -->
              <div
                class="max-w-[78%] break-words rounded-2xl px-4 py-2.5 text-sm leading-relaxed"
                :class="
                  m.role === 'user'
                    ? 'bg-blue-600 text-white shadow-sm whitespace-pre-wrap'
                    : 'bg-white text-slate-900 shadow-sm border border-slate-200'
                "
              >
                <!-- 助手消息：渲染 Markdown 为安全 HTML -->
                <div v-if="m.role === 'assistant'" v-html="renderMarkdownToSafeHtml(m.content)" />
                <!-- 用户消息：保持纯文本但支持换行 -->
                <div v-else v-html="textToSafeHtml(m.content)" />
              </div>
            </div>
          </template>
          <template v-else>
            <div class="grid place-items-center py-16">
              <div class="text-center">
                <div class="mb-2 text-lg font-medium text-slate-800">开始一段优雅的对话</div>
                <div class="text-sm text-slate-500">输入问题并发送，我会尽力给出最好的答案</div>
              </div>
            </div>
          </template>

          <!-- 加载提示（打字机效果由流式更新实现） -->
          <div v-if="isLoading" class="text-xs text-slate-500">AI 正在回复...</div>

          <!-- 错误提示 -->
          <div
            v-if="error"
            class="mt-2 rounded-lg border border-red-300 bg-red-50 p-2 text-xs text-red-700"
          >
            {{ error }}
          </div>
        </div>
      </div>

      <!-- 底部输入区：卡片式输入与发送，让交互更顺滑 -->
      <div class="bg-white/80 px-3">
        <div class="rounded-2xl border border-slate-300 bg-white shadow-sm">
          <div class="flex items-end gap-2 p-2">
            <textarea
              ref="inputRef"
              v-model="text"
              @keydown="onKeydown"
              placeholder="Shift+Enter 换行，Enter 发送"
              rows="3"
              class="flex-1 resize-y rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/70"
            />
            <button
              :disabled="isLoading || !text.trim()"
              @click="handleSend"
              class="inline-flex items-center gap-1 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition disabled:opacity-50 hover:bg-blue-600/90 active:scale-[0.99]"
            >
              <span>发送</span>
              <span aria-hidden="true">→</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped></style>
