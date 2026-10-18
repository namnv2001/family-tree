import { useEffect, useRef, useState } from 'react'
import type { NewPerson, Person } from '../lib/people'
import { countRelationships, createPerson, deletePerson, listPeople, matchesName } from '../lib/people'
import { PersonForm } from './PersonForm'
import { PersonRow } from './PersonRow'

const UNDO_MS = 10_000 // FR-1.2: undo trong 10 giây

type PendingDelete = { person: Person; timer: ReturnType<typeof setTimeout> }

export function PeoplePage() {
  const [people, setPeople] = useState<Person[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  // Map giữ ở ref (nguồn sự thật, không async-stale); pendingIds ở state chỉ để
  // ép re-render khi map đổi — đọc map trong lúc render vẫn luôn là bản mới nhất.
  const pending = useRef(new Map<string, PendingDelete>())
  const [pendingIds, setPendingIds] = useState<string[]>([])

  useEffect(() => {
    listPeople()
      .then(setPeople)
      .catch((err) => setError(err instanceof Error ? err.message : 'Không tải được danh sách.'))
  }, [])

  useEffect(() => {
    // Rời trang giữa lúc đang chờ undo: hủy hẹn giờ, đừng xóa "ma" sau khi unmount.
    // Map không bao giờ bị gán lại (chỉ mutate in-place) nên giữ tham chiếu ở đây an toàn.
    const map = pending.current
    return () => {
      map.forEach(({ timer }) => clearTimeout(timer))
    }
  }, [])

  if (error) return <p className="p-4 text-red-600">{error}</p>
  if (!people) return <p className="p-4 text-stone-400">Đang tải…</p>

  const visible = people.filter((p) => !pending.current.has(p.id) && (!query.trim() || matchesName(p, query)))

  async function handleAdd(input: NewPerson) {
    const created = await createPerson(input)
    setPeople((prev) => [...(prev ?? []), created]) // FR-1.1: node xuất hiện ngay, không reload
  }

  function handleChanged(updated: Person) {
    setPeople((prev) => prev?.map((p) => (p.id === updated.id ? updated : p)) ?? prev)
  }

  async function handleDeleteClick(person: Person) {
    let related = 0
    try {
      related = await countRelationships(person.id)
    } catch {
      // Kiểm lỗi mạng — vẫn cho xóa tiếp với cảnh báo chung, đừng khóa người dùng lại.
    }
    const message =
      related > 0
        ? `${person.full_name} đang có ${related} quan hệ (cha/mẹ, vợ/chồng hoặc con). ` +
          `Xóa sẽ ngắt các liên kết này.\n\nXóa người này?`
        : `Xóa ${person.full_name}? Bạn có 10 giây để hoàn tác.`
    if (!window.confirm(message)) return
    requestDelete(person)
  }

  function requestDelete(person: Person) {
    const timer = setTimeout(() => commitDelete(person.id), UNDO_MS)
    pending.current.set(person.id, { person, timer })
    setPendingIds(Array.from(pending.current.keys()))
  }

  function undoDelete(id: string) {
    const entry = pending.current.get(id)
    if (!entry) return
    clearTimeout(entry.timer)
    pending.current.delete(id)
    setPendingIds(Array.from(pending.current.keys()))
  }

  async function commitDelete(id: string) {
    pending.current.delete(id)
    setPendingIds(Array.from(pending.current.keys()))
    try {
      await deletePerson(id)
      setPeople((prev) => prev?.filter((p) => p.id !== id) ?? prev)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Xóa thất bại.')
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
        <PersonForm onAdd={handleAdd} />

        {people.length > 0 && (
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Tìm trong ${people.length} người…`}
            aria-label="Tìm theo tên"
            className="rounded-md border border-stone-300 px-3 py-1.5 text-sm"
          />
        )}

        {visible.length === 0 && (
          <p className="text-center text-stone-400">
            {query.trim() ? 'Không có ai khớp tên này.' : 'Chưa có thành viên nào. Thêm người đầu tiên ở trên.'}
          </p>
        )}

        <ul className="flex flex-col gap-2">
          {visible.map((p) => (
            <li key={p.id}>
              <PersonRow
                person={p}
                onChanged={handleChanged}
                onDelete={() => handleDeleteClick(p)}
              />
            </li>
          ))}
        </ul>

        <div className="pointer-events-none fixed inset-x-0 bottom-4 flex flex-col items-center gap-2">
          {pendingIds.map((id) => {
            const entry = pending.current.get(id)
            if (!entry) return null
            return (
              <div
                key={id}
                className="pointer-events-auto flex items-center gap-3 rounded-lg bg-stone-800 px-4 py-2 text-sm text-white shadow-lg"
              >
                <span>Đã xóa {entry.person.full_name}.</span>
                <button
                  onClick={() => undoDelete(id)}
                  className="font-semibold text-amber-300 hover:text-amber-200"
                >
                  Hoàn tác
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
