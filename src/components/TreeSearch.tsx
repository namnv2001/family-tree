import { useMemo, useState } from 'react'
import { matchesName, type Person } from '../lib/people'

// FR-4.1: gõ tên (không phân biệt dấu) → chọn kết quả → cây pan/zoom tới node
// (xử lý ở TreeView qua onSelect, component này chỉ lo lọc + hiển thị dropdown).
const MAX_RESULTS = 8

const LISTBOX_ID = 'tree-search-listbox'

export function TreeSearch({
  people,
  onSelect,
}: {
  people: Person[]
  onSelect: (person: Person) => void
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  // NFR a11y: chỉ số kết quả đang chọn bằng bàn phím (mũi tên lên/xuống) —
  // KHÔNG dùng focus DOM thật (theo mẫu combobox chuẩn: focus vẫn ở input,
  // "đang chọn" chỉ báo qua aria-activedescendant + tô nền), nên input không
  // bao giờ mất focus khi rê chuột/di chuyển bằng phím.
  const [activeIndex, setActiveIndex] = useState(-1)

  const results = useMemo(() => {
    if (!query.trim()) return []
    return people.filter((p) => matchesName(p, query)).slice(0, MAX_RESULTS)
  }, [people, query])

  function pick(person: Person) {
    onSelect(person)
    setQuery(person.full_name)
    setOpen(false)
    setActiveIndex(-1)
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
      const chosen = activeIndex >= 0 ? results[activeIndex] : results[0]
      if (chosen) {
        e.preventDefault()
        pick(chosen)
      }
    } else if (e.key === 'Escape') {
      if (open) {
        e.preventDefault()
        setOpen(false)
        setActiveIndex(-1)
      }
    }
  }

  const activeId = activeIndex >= 0 ? `tree-search-option-${results[activeIndex]!.id}` : undefined

  return (
    <div className="relative">
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
          setActiveIndex(-1)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={handleKeyDown}
        placeholder="Tìm theo tên…"
        aria-label="Tìm theo tên"
        role="combobox"
        aria-expanded={open && results.length > 0}
        aria-controls={LISTBOX_ID}
        aria-autocomplete="list"
        aria-activedescendant={activeId}
        className="w-48 rounded-md border border-stone-300 px-2.5 py-1.5 text-sm"
      />
      {open && results.length > 0 && (
        <ul
          id={LISTBOX_ID}
          role="listbox"
          className="absolute right-0 z-20 mt-1 w-64 rounded-md border border-stone-200 bg-white py-1 text-sm shadow-lg"
        >
          {results.map((p, i) => (
            // Không dùng <button>: theo mẫu combobox chuẩn, các option không tự
            // là điểm dừng Tab riêng — bàn phím điều khiển qua input (mũi tên +
            // Enter ở trên), div này chỉ cần bấm được bằng chuột. onMouseDown +
            // preventDefault (thay vì onClick + onBlur setTimeout): chặn input
            // mất focus trước khi bấm đăng ký, khỏi cần race-condition timeout hack.
            <li
              key={p.id}
              id={`tree-search-option-${p.id}`}
              role="option"
              aria-selected={i === activeIndex}
              onMouseDown={(e) => {
                e.preventDefault()
                pick(p)
              }}
              onMouseEnter={() => setActiveIndex(i)}
              className={`block w-full cursor-pointer truncate px-3 py-1.5 ${
                i === activeIndex ? 'bg-stone-100' : 'hover:bg-stone-50'
              }`}
            >
              {p.full_name}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
