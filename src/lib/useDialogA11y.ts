import { useEffect, useRef } from 'react'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * NFR a11y: bẫy Tab trong hộp thoại (không để Tab lọt ra canvas phía sau),
 * đóng bằng Escape, focus vào phần tử đầu tiên lúc mở, trả focus về đúng chỗ
 * cũ lúc đóng. Dùng chung cho RelationshipModal/ShareModal — cả hai đều là
 * overlay `fixed inset-0` + đóng bằng click nền, giờ thêm đường bàn phím
 * tương đương thay vì chỉ đóng được bằng chuột.
 */
export function useDialogA11y<T extends HTMLElement>(onClose: () => void) {
  const ref = useRef<T>(null)

  useEffect(() => {
    const container = ref.current
    if (!container) return
    const previouslyFocused = document.activeElement as HTMLElement | null

    const focusables = () => Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE))
    ;(focusables()[0] ?? container).focus()

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }
      if (e.key !== 'Tab') return
      const items = focusables()
      if (items.length === 0) return
      const first = items[0]!
      const last = items[items.length - 1]!
      // Tab ở cuối vòng lại đầu, Shift+Tab ở đầu vòng lại cuối — không thì Tab
      // thoát ra ngoài dialog, chạm vào nút "+Cha/Mẹ"/... đang bị che phía sau.
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      previouslyFocused?.focus() // trả focus về nút vừa mở dialog (vd nút "Chia sẻ" ở header)
    }
  }, [onClose])

  return ref
}
