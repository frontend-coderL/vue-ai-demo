// 简易 Markdown 渲染工具：使用 markdown-it 解析，并用 DOMPurify 进行安全清洗
// 目的：将 AI 助手的 Markdown 内容安全地渲染为 HTML，避免 XSS 风险

import MarkdownIt from 'markdown-it'
import DOMPurify from 'dompurify'

// 创建 markdown-it 实例
const md = new MarkdownIt({
  html: false, // 不允许原始 HTML，避免未经处理的注入
  linkify: true, // 自动链接化 URL
  breaks: true, // 将换行视为 <br>
})

/**
 * 将 Markdown 文本渲染为安全的 HTML 字符串
 */
export function renderMarkdownToSafeHtml(src: string): string {
  const rawHtml = md.render(src || '')
  // 使用 DOMPurify 清洗，避免潜在的 XSS
  return DOMPurify.sanitize(rawHtml)
}

/**
 * 简单的纯文本转 HTML：用于用户消息
 * - 转义特殊字符
 * - 将换行转换为 <br>
 */
export function textToSafeHtml(src: string): string {
  const escaped = (src || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  return escaped.replace(/\n/g, '<br/>')
}