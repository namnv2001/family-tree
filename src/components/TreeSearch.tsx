import { useMemo, useState } from 'react'
import { matchesName, type Person } from '../lib/people'

// FR-4.1: gõ tên (không phân biệt dấu) → chọn kết quả → cây pan/zoom tới node
// (xử lý ở TreeView qua onSelect, component này chỉ lo lọc + hiển thị dropdown).
const MAX_RESULTS = 8

export function TreeSearch({
  people,
  onSelect,
}: {
  people: Person[]
  onSelect: (person: Person) => void
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)

  const results = useMemo(() => {
    if (!query.trim()) return []
    return people.filter((p) => matchesName(p, query)).slice(0, MAX_RESULTS)
  }, [people, query])

  function pick(person: Person) {
    onSelect(person)
    setQuery(person.full_name)
    setOpen(false)
  }

  return (
    <div className="relative">
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && results[0]) {
            e.preventDefault()
            pick(results[0])
          }
        }}
        placeholder="Tìm theo tên…"
        aria-label="Tìm theo tên"
        className="w-48 rounded-md border border-stone-300 px-2.5 py-1.5 text-sm"
      />
      {open && results.length > 0 && (
        <ul className="absolute right-0 z-20 mt-1 w-64 rounded-md border border-stone-200 bg-white py-1 text-sm shadow-lg">
          {results.map((p) => (
            <li key={p.id}>
              {/* onMouseDown + preventDefault (thay vì onClick + onBlur setTimeout):
                  chặn input mất focus trước khi bấm đăng ký — input không bao giờ
                  blur do bấm item này, nên tự đóng dropdown qua pick() là đủ, không
                  cần race-condition timeout hack. */}
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault()
                  pick(p)
                }}
                className="block w-full truncate px-3 py-1.5 text-left hover:bg-stone-50"
              >
                {p.full_name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
