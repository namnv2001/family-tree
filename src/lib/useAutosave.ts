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
  // Giá trị lần cuối đã LÊN LỊCH lưu, khởi tạo = giá trị ban đầu từ server — so
  // sánh THEO NỘI DUNG, không dùng cờ boolean "đã chạy lần đầu chưa" (cách cũ).
  // Lý do: StrictMode (bọc ở main.tsx) chạy lại effect mount 2 lần (mount →
  // cleanup → mount lại) để bắt lỗi thiếu cleanup — cờ boolean chỉ đúng ở lần
  // chạy đầu, lần chạy giả lập thứ 2 thấy cờ đã true (ref không reset giữa 2
  // lần) nên tưởng nhầm là thay đổi thật, tự lên lịch PATCH dù value y hệt lúc
  // tải (bug quan sát được: vào danh sách N người bắn N PATCH vô ích). So sánh
  // theo nội dung thì chịu được double-invoke: chạy lại với ĐÚNG giá trị cũ vẫn
  // nhận ra "không đổi gì" nên bỏ qua, không phụ thuộc effect chạy mấy lần.
  const lastScheduled = useRef(JSON.stringify(value))

  useEffect(() => {
    latest.current = value
    const serialized = JSON.stringify(value)
    if (serialized === lastScheduled.current) return
    lastScheduled.current = serialized

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
