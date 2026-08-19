import { useEffect, useRef, useState } from 'react'

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'offline' | 'invalid'

// Lỗi "đừng lưu, đừng thử lại" — dùng cho validation (ví dụ thiếu họ tên bắt buộc),
// khác với lỗi mạng (offline) là loại phải tự thử lại.
export class AutosaveSkip extends Error {}

const RETRY_START_MS = 2000
const RETRY_MAX_MS = 30_000

/**
 * FR-6.3: tự lưu mọi thay đổi, không có nút Save. Debounce theo `value`; nếu lưu
 * lỗi (mất mạng) thì tự thử lại với backoff, và KHÔNG BAO GIỜ ghi đè giá trị đang
 * nhập trên UI — nội dung người dùng gõ luôn được giữ nguyên dù lưu thành công hay chưa.
 */
export function useAutosave<T>(
  value: T,
  save: (value: T) => Promise<void>,
  delayMs = 600,
): SaveStatus {
  const [status, setStatus] = useState<SaveStatus>('idle')
  const latest = useRef(value)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const retryDelay = useRef(RETRY_START_MS)
  const savedOnce = useRef(false)

  useEffect(() => {
    latest.current = value
    if (!savedOnce.current) {
      savedOnce.current = true
      return // giá trị khởi tạo từ server — không cần lưu lại
    }

    clearTimeout(timer.current)
    retryDelay.current = RETRY_START_MS
    timer.current = setTimeout(attempt, delayMs)
    return () => clearTimeout(timer.current)

    function attempt() {
      const toSave = latest.current
      setStatus('saving')
      save(toSave)
        .then(() => {
          if (latest.current === toSave) setStatus('saved')
        })
        .catch((err) => {
          if (latest.current !== toSave) return // đã có lượt lưu mới hơn đang chờ, bỏ lượt này
          if (err instanceof AutosaveSkip) {
            setStatus('invalid')
            return
          }
          setStatus('offline')
          timer.current = setTimeout(attempt, retryDelay.current)
          retryDelay.current = Math.min(retryDelay.current * 2, RETRY_MAX_MS)
        })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(value)])

  return status
}
