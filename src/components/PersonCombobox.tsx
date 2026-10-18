import { useEffect, useId, useMemo, useState } from 'react'
import { matchesName, type Person } from '../lib/people'

// Ô gõ-để-lọc theo tên (không phân biệt dấu), 2 kiểu dùng:
// - Tìm (không truyền selectedId): gõ mới hiện kết quả, chọn xong gọi onSelect.
// - Chọn người (có selectedId): thay cho <select> — focus là hiện cả danh sách,
//   ô hiển thị tên người đang chọn, xoá trắng rồi rời ô là bỏ chọn.
export function PersonCombobox({
  people,
  onSelect,
  selectedId,
  placeholder = 'Tìm theo tên…',
  label = 'Tìm theo tên',
  className = 'w-48',
}: {
  people: Person[]
  onSelect: (person: Person | null) => void
  selectedId?: string
  placeholder?: string
  label?: string
  className?: string
}) {
  const isPicker = selectedId !== undefined
  const selectedName = people.find((p) => p.id === selectedId)?.full_name ?? ''
  const [query, setQuery] = useState(selectedName)
  const [open, setOpen] = useState(false)
  // NFR a11y: chỉ số kết quả đang chọn bằng bàn phím (mũi tên lên/xuống) —
  // KHÔNG dùng focus DOM thật (theo mẫu combobox chuẩn: focus vẫn ở input,
  // "đang chọn" chỉ báo qua aria-activedescendant + tô nền), nên input không
  // bao giờ mất focus khi rê chuột/di chuyển bằng phím.
  const [activeIndex, setActiveIndex] = useState(-1)
  const idPrefix = useId()
  const listboxId = `${idPrefix}-listbox`

  // Form cha đổi lựa chọn từ bên ngoài (vd: reset sau khi thêm) → ô hiện theo.
  useEffect(() => {
    if (isPicker) setQuery(selectedName)
  }, [isPicker, selectedName])

  const results = useMemo(() => {
    const q = query.trim()
    if (!q || (isPicker && q === selectedName)) {
      return isPicker ? [...people].sort((a, b) => a.full_name.localeCompare(b.full_name, 'vi')) : []
    }
    const matches = people.filter((p) => matchesName(p, q))
    return isPicker ? matches : matches.slice(0, 8)
  }, [people, query, isPicker, selectedName])

  function pick(person: Person) {
    onSelect(person)
    setQuery(person.full_name)
    setOpen(false)
    setActiveIndex(-1)
  }

  function handleBlur() {
    setOpen(false)
    setActiveIndex(-1)
    if (!isPicker) return
    if (!query.trim()) {
      if (selectedId) onSelect(null)
    } else {
      setQuery(selectedName)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (results.length === 0) return
      setOpen(true)
      setActiveIndex((i) => (i + 1) % results.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (results.length === 0) return
      setOpen(true)
      setActiveIndex((i) => (i <= 0 ? results.length - 1 : i - 1))
    } else if (e.key === 'Enter') {
      const chosen = activeIndex >= 0 ? results[activeIndex] : open ? results[0] : undefined
      if (chosen) {
        e.preventDefault()
        pick(chosen)
      }
    } else if (e.key === 'Escape') {
      if (open) {
        // Chỉ đóng dropdown — không để Escape lan lên làm đóng luôn modal chứa ô này.
        e.preventDefault()
        e.stopPropagation()
        setOpen(false)
        setActiveIndex(-1)
      }
    }
  }

  const activeId = activeIndex >= 0 ? `${idPrefix}-option-${results[activeIndex]!.id}` : undefined

  return (
    <div className={`relative ${className}`}>
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
          setActiveIndex(-1)
        }}
        onFocus={(e) => {
          setOpen(true)
          if (isPicker) e.target.select()
        }}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        aria-label={label}
        role="combobox"
        aria-expanded={open && results.length > 0}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={activeId}
        className="w-full rounded-md border border-stone-300 px-2.5 py-1.5 text-sm"
      />
      {open && results.length > 0 && (
        <ul
          id={listboxId}
          role="listbox"
          className={`absolute ${isPicker ? 'left-0' : 'right-0'} z-20 mt-1 max-h-64 w-full min-w-64 overflow-y-auto rounded-md border border-stone-200 bg-white py-1 text-sm shadow-lg`}
        >
          {results.map((p, i) => (
            // Không dùng <button>: theo mẫu combobox chuẩn, các option không tự
            // là điểm dừng Tab riêng — bàn phím điều khiển qua input (mũi tên +
            // Enter ở trên), div này chỉ cần bấm được bằng chuột. onMouseDown +
            // preventDefault (thay vì onClick + onBlur setTimeout): chặn input
            // mất focus trước khi bấm đăng ký, khỏi cần race-condition timeout hack.
            <li
              key={p.id}
              id={`${idPrefix}-option-${p.id}`}
              role="option"
              aria-selected={i === activeIndex}
              onMouseDown={(e) => {
                e.preventDefault()
                pick(p)
              }}
              onMouseEnter={() => setActiveIndex(i)}
              className={`block w-full cursor-pointer truncate px-3 py-1.5 ${
                i === activeIndex ? 'bg-stone-100' : 'hover:bg-stone-50'
              } ${p.id === selectedId ? 'font-medium' : ''}`}
            >
              {p.full_name}
              {isPicker && p.birth_date && <span className="ml-1 text-stone-400">({p.birth_date})</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
