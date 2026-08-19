import { useEffect, useRef, useState, type ReactNode } from 'react'

/**
 * 細 toast：彈一句喺屏幕下面，兩秒自己走。
 *
 * 得一句 —— 未走得切又彈過就蓋過上一句，個鐘由頭計。
 * `role="status"` 俾讀屏軟件都聽到；pointer-events 唔食，唔會阻住撳嘢。
 */
export function useToast(): { toast: ReactNode; show: (text: string) => void } {
  const [text, setText] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current)
    },
    [],
  )

  function show(next: string) {
    setText(next)
    if (timer.current !== null) clearTimeout(timer.current)
    timer.current = setTimeout(() => setText(null), 2200)
  }

  const toast =
    text === null ? null : (
      <div className="toast chamfer-sm" role="status">
        {text}
      </div>
    )

  return { toast, show }
}
