/**
 * 打字机效果工具方法
 * - 用于 AI 流式对话中逐字显示内容，提升可读性与沉浸感
 * - 保持原有功能不变，同时增强类型定义与可维护性
 */

/**
 * 打字机参数类型
 * - speed: 每个批次输出间隔（毫秒）
 * - step: 每次输出的字符数（批量输出以减少重渲染）
 * - punctuationFactor: 标点停顿倍数（越大停顿越久）
 */
export interface TypewriterSettings {
  speed: number
  step: number
  punctuationFactor: number
}

/**
 * 控制器返回对象类型
 * - 提供队列化、取消、中途加速等能力
 */
export interface TypewriterController {
  push: (text: string) => void
  flush: () => Promise<void>
  clear: () => void
  abort: () => void
  setSpeed: (newSpeed: number) => void
  setStep: (newStep: number) => void
  setPunctuationFactor: (factor: number) => void
  enableAutoTune: (flag: boolean) => void
  finishWithin: (ms: number) => void
}

// 标点正则常量（与原逻辑保持一致）
const PUNCTUATION_REGEX = /[.,!?，。！？]/

/**
 * 数值归一化（取整并限定最小值）
 * @param value 原始值
 * @param min 最小边界
 */
function normalizeInt(value: number, min: number): number {
  return Math.max(min, Math.floor(value))
}

/**
 * 是否为标点字符
 * @param ch 单个字符
 */
function isPunctuation(ch: string): boolean {
  return PUNCTUATION_REGEX.test(ch)
}

/**
 * 逐字输出一段文字（支持取消与批量输出）
 * @param target 目标对象（例如 { content: '' }）
 * @param text 要输出的文本
 * @param settings 打字参数（speed/step/punctuationFactor）
 * @param signal 可选取消信号，用于中断当前打字
 */
export function typewriterEffect(
  target: { content: string },
  text: string,
  settings: TypewriterSettings,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve) => {
    let i = 0
    let cooldownMs = 0

    /**
     * 单次输出并根据当前设置计算下一次延迟
     */
    const tick = () => {
      // 若已取消，立即结束
      if (signal?.aborted) {
        resolve()
        return
      }

      // 归一化参数（与原逻辑一致）
      const step = normalizeInt(settings.step, 1)
      const speed = normalizeInt(settings.speed, 0)
      const puncFactor = normalizeInt(settings.punctuationFactor, 1)

      // 若存在标点后的临时冷却，则仅等待一次
      if (cooldownMs > 0) {
        cooldownMs = Math.max(0, cooldownMs - speed)
        setTimeout(tick, speed)
        return
      }

      // 按步输出一段字符，减少渲染频率
      const next = text.slice(i, i + step)
      if (next.length > 0) {
        target.content += next
        i += next.length
      }

      // 在标点后插入额外等待时间（更自然的打字感）
      const lastChar = next.charAt(next.length - 1)
      if (lastChar && isPunctuation(lastChar)) {
        cooldownMs = speed * puncFactor
      }

      // 结束条件判断
      if (i >= text.length) {
        resolve()
        return
      }

      // 下一次调度
      setTimeout(tick, speed)
    }

    // 启动首个 tick
    setTimeout(tick, normalizeInt(settings.speed, 0))
  })
}

/**
 * 创建一个打字机队列控制器
 * - 支持多段文本依次打字（队列化）
 * - 可并行接收流式分段数据（push 多次）
 * - 修复 flush 在打字中“立即返回”的问题（正确等待）
 * - 提供取消能力避免残留定时器（abort）
 * @param target 目标对象（例如 { content: '' }）
 * @param speed 初始速度（毫秒，默认 20）
 * @param step 初始步进（每次输出字符数，默认 1）
 */
export function createTypewriterController(
  target: { content: string },
  speed = 20,
  step = 1,
): TypewriterController {
  // 队列与状态
  const queue: string[] = []
  let isTyping = false
  let typingPromise: Promise<void> | null = null
  let abortCtrl: AbortController | null = null
  let stopRequested = false

  // 归一化基础参数
  let baseSpeed = normalizeInt(speed, 0)
  let baseStep = normalizeInt(step, 1)

  // 可变打字参数（会被自动调速与 finishWithin 影响）
  const settings: TypewriterSettings = {
    speed: baseSpeed,
    step: baseStep,
    punctuationFactor: 4,
  }

  // 标点停顿因子（用于自动调速动态调整）
  let charPuncFactor = 4
  let autoTune = true
  let fastFinishActive = false

  /**
   * 根据队列长度动态调节速度与步进
   * - 队列越长，间隔越短（更快），步进越大（每次输出更多字符）
   * - 标点停顿因子在队列长时降低，减少总等待
   */
  function applyAutoTuning(): void {
    if (!autoTune || fastFinishActive) return
    const q = queue.length
    // 加速：每条队列减少 2ms，保底 8ms
    const speedBoost = Math.min(q * 2, Math.max(0, baseSpeed - 8))
    settings.speed = Math.max(8, baseSpeed - speedBoost)
    // 步进：每 5 条队列增加 1，最多 4
    settings.step = Math.min(4, baseStep + Math.floor(q / 5))
    // 标点减速因子：队列长时适当降低，保底 2
    charPuncFactor = Math.max(2, 4 - Math.floor(q / 8))
    settings.punctuationFactor = charPuncFactor
  }

  /**
   * 处理队列中的文本，确保单例运行并返回同一个 Promise
   */
  function processQueue(): Promise<void> {
    if (typingPromise) return typingPromise

    typingPromise = (async () => {
      if (isTyping) return
      isTyping = true
      stopRequested = false
      try {
        while (queue.length > 0 && !stopRequested) {
          const text = queue.shift()
          if (!text) continue
          // 在处理每段文本之前，根据当前队列长度调整参数
          applyAutoTuning()
          abortCtrl = new AbortController()
          await typewriterEffect(target, text, settings, abortCtrl.signal)
        }
      } finally {
        isTyping = false
        abortCtrl = null
        fastFinishActive = false
      }
    })()

    typingPromise.finally(() => {
      typingPromise = null
    })

    return typingPromise
  }

  return {
    /**
     * 向队列添加一段文字
     * @param text 待打字的文本片段
     */
    push(text: string): void {
      queue.push(text)
      void processQueue()
    },
    /**
     * 等待所有文字输出完成（正确等待进行中的打字）
     */
    async flush(): Promise<void> {
      await processQueue()
      if (typingPromise) {
        await typingPromise
      }
    },
    /**
     * 清空未开始的队列（不影响当前批次）
     */
    clear(): void {
      queue.length = 0
    },
    /**
     * 终止当前打字并清空队列
     */
    abort(): void {
      stopRequested = true
      queue.length = 0
      abortCtrl?.abort()
    },
    /**
     * 设置速度（毫秒）
     * @param newSpeed 新速度（毫秒）
     */
    setSpeed(newSpeed: number): void {
      baseSpeed = normalizeInt(newSpeed, 0)
      settings.speed = baseSpeed
    },
    /**
     * 设置步进（每批次输出字符数）
     * @param newStep 新步进
     */
    setStep(newStep: number): void {
      baseStep = normalizeInt(newStep, 1)
      settings.step = baseStep
    },
    /**
     * 调整标点减速因子（倍数越大停顿越久）
     * @param factor 新的标点停顿倍数
     */
    setPunctuationFactor(factor: number): void {
      charPuncFactor = normalizeInt(factor, 1)
      settings.punctuationFactor = charPuncFactor
    },
    /**
     * 开关自动调速（根据队列长度自适应速度与步进）
     * @param flag 是否启用自动调速
     */
    enableAutoTune(flag: boolean): void {
      autoTune = !!flag
    },
    /**
     * 在给定时间内尽快完成剩余输出
     * - 动态调大步进、降到极低的速度
     * - 合并队列以减少 tick 次数
     * @param ms 期望完成时间（毫秒）
     */
    finishWithin(ms: number): void {
      const maxMs = normalizeInt(ms, 0)
      // 极限参数：近似在一次或极少次 tick 完成
      settings.speed = Math.min(4, Math.max(1, Math.floor(maxMs / 1000)))
      settings.step = 1_000_000
      settings.punctuationFactor = 1
      fastFinishActive = true
      // 合并队列减少批次数
      if (queue.length > 1) {
        const merged = queue.join('')
        queue.splice(0, queue.length, merged)
      }
    },
  }
}
