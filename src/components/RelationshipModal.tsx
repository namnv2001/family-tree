import { useState, type FormEvent } from 'react'
import type { Gender, Person } from '../lib/people'
import { createPerson } from '../lib/people'
import { useDialogA11y } from '../lib/useDialogA11y'
import {
  ancestorsOf,
  childrenOf,
  createRelationship,
  dateWarnings,
  deleteRelationship,
  descendantsOf,
  parentsOf,
  spousesOf,
  updateRelationshipStatus,
  type RelatedPerson,
  type Relationship,
  type SpouseStatus,
} from '../lib/relationships'

export type RelationshipKind = 'parent' | 'spouse' | 'child'

const KIND_LABEL: Record<RelationshipKind, string> = {
  parent: 'Cha/Mẹ',
  spouse: 'Vợ/Chồng',
  child: 'Con',
}

const STATUS_LABEL: Record<SpouseStatus, string> = {
  married: 'Đang kết hôn',
  divorced: 'Đã ly hôn',
  widowed: 'Đã mất',
}

export function RelationshipModal({
  person,
  kind,
  people,
  relationships,
  onClose,
  onPersonCreated,
  onRelationshipCreated,
  onRelationshipChanged,
  onRelationshipDeleted,
}: {
  person: Person
  kind: RelationshipKind
  people: Person[]
  relationships: Relationship[]
  onClose: () => void
  onPersonCreated: (p: Person) => void
  onRelationshipCreated: (r: Relationship) => void
  onRelationshipChanged: (r: Relationship) => void
  onRelationshipDeleted: (id: string) => void
}) {
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const dialogRef = useDialogA11y<HTMLDivElement>(onClose)

  const existing: RelatedPerson[] =
    kind === 'parent'
      ? parentsOf(person.id, people, relationships)
      : kind === 'child'
        ? childrenOf(person.id, people, relationships)
        : spousesOf(person.id, people, relationships)

  const parentSlotsFull = kind === 'parent' && existing.length >= 2 // FR-2.2: tối đa 2 cha/mẹ

  // FR-2.4: xóa liên kết, không đụng tới người.
  async function handleDelete(rel: Relationship, otherName: string) {
    if (!window.confirm(`Xóa liên kết với ${otherName}?`)) return
    setDeleteError(null)
    try {
      await deleteRelationship(rel.id)
      onRelationshipDeleted(rel.id)
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Xóa liên kết thất bại.')
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="relationship-modal-title"
        tabIndex={-1}
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg bg-white p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 id="relationship-modal-title" className="font-semibold text-stone-800">
            {KIND_LABEL[kind]} của {person.full_name}
          </h2>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-700" aria-label="Đóng">
            ✕
          </button>
        </div>

        {existing.length > 0 && (
          <ul className="mb-4 flex flex-col gap-1.5">
            {existing.map(({ rel, person: other }) => (
              <li
                key={rel.id}
                className="flex items-center justify-between rounded-md border border-stone-200 px-2.5 py-1.5 text-sm"
              >
                <span className="flex items-center gap-1.5">
                  {other.full_name}
                  {rel.type === 'spouse_of' && rel.status && (
                    <SpouseStatusSelect rel={rel} onChanged={onRelationshipChanged} />
                  )}
                </span>
                <button
                  onClick={() => handleDelete(rel, other.full_name)}
                  className="text-xs text-red-600 hover:underline"
                >
                  Xóa liên kết
                </button>
              </li>
            ))}
          </ul>
        )}
        {deleteError && <p className="mb-3 text-sm text-red-600">{deleteError}</p>}

        {parentSlotsFull ? (
          <p className="text-sm text-stone-500">Đã đủ 2 cha/mẹ — xóa bớt một liên kết ở trên nếu muốn thay.</p>
        ) : (
          <AddForm
            person={person}
            kind={kind}
            people={people}
            relationships={relationships}
            onPersonCreated={onPersonCreated}
            onRelationshipCreated={onRelationshipCreated}
          />
        )}
      </div>
    </div>
  )
}

// Sửa status ngay tại chỗ (vd: "Đang kết hôn" -> "Đã mất" khi người kia qua
// đời) — tự lưu khi đổi, không cần nút Save riêng, cùng tinh thần FR-6.3.
function SpouseStatusSelect({
  rel,
  onChanged,
}: {
  rel: Relationship
  onChanged: (r: Relationship) => void
}) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleChange(status: SpouseStatus) {
    setSaving(true)
    setError(null)
    try {
      await updateRelationshipStatus(rel.id, status)
      onChanged({ ...rel, status })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Cập nhật thất bại.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <span className="inline-flex items-center gap-1">
      <select
        value={rel.status ?? 'married'}
        disabled={saving}
        onChange={(e) => handleChange(e.target.value as SpouseStatus)}
        className="rounded border border-stone-200 bg-transparent py-0.5 text-xs text-stone-500 disabled:opacity-50"
      >
        <option value="married">{STATUS_LABEL.married}</option>
        <option value="divorced">{STATUS_LABEL.divorced}</option>
        <option value="widowed">{STATUS_LABEL.widowed}</option>
      </select>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  )
}

function AddForm({
  person,
  kind,
  people,
  relationships,
  onPersonCreated,
  onRelationshipCreated,
}: {
  person: Person
  kind: RelationshipKind
  people: Person[]
  relationships: Relationship[]
  onPersonCreated: (p: Person) => void
  onRelationshipCreated: (r: Relationship) => void
}) {
  // FR-2.1 AC: thêm con cho một cặp vợ/chồng → con tự gắn với cả hai.
  const spouses = kind === 'child' ? spousesOf(person.id, people, relationships) : []

  const [mode, setMode] = useState<'existing' | 'new'>('existing')
  const [existingId, setExistingId] = useState('')
  const [newName, setNewName] = useState('')
  const [newGender, setNewGender] = useState<Gender>('male')
  const [status, setStatus] = useState<SpouseStatus>('married')
  // Chỉ 1 vợ/chồng thì không có gì phải chọn — mặc định gắn con với cả hai
  // luôn (đúng AC), người dùng vẫn đổi được nếu con này thật ra chỉ có 1 cha/mẹ.
  const [coParentId, setCoParentId] = useState(() => (spouses.length === 1 ? spouses[0]!.person.id : ''))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const excluded = new Set<string>([person.id])
  for (const { person: p } of kind === 'parent' ? parentsOf(person.id, people, relationships) : []) excluded.add(p.id)
  for (const { person: p } of kind === 'child' ? childrenOf(person.id, people, relationships) : []) excluded.add(p.id)
  for (const { person: p } of kind === 'spouse' ? spousesOf(person.id, people, relationships) : []) excluded.add(p.id)
  // Không cho chọn người sẽ tạo vòng lặp (chắc chắn bị assertValidRelationship chặn — lọc trước cho gọn).
  if (kind === 'parent') for (const id of descendantsOf(person.id, relationships)) excluded.add(id)
  if (kind === 'child') for (const id of ancestorsOf(person.id, relationships)) excluded.add(id)

  const candidates = people.filter((p) => !excluded.has(p.id))

  const chosenExisting = mode === 'existing' ? (people.find((p) => p.id === existingId) ?? null) : null
  const warnings =
    kind === 'parent' && chosenExisting
      ? dateWarnings(chosenExisting, person)
      : kind === 'child' && chosenExisting
        ? dateWarnings(person, chosenExisting)
        : []

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    let otherId = existingId
    try {
      setBusy(true)
      if (mode === 'new') {
        const name = newName.trim()
        if (!name) {
          setError('Cần nhập họ tên.')
          return
        }
        const created = await createPerson({ full_name: name, gender: newGender })
        onPersonCreated(created)
        otherId = created.id
      } else if (!otherId) {
        setError('Chọn một người.')
        return
      }

      if (kind === 'parent') {
        const r = await createRelationship({ type: 'parent_of', from_id: otherId, to_id: person.id })
        onRelationshipCreated(r)
      } else if (kind === 'spouse') {
        const r = await createRelationship({
          type: 'spouse_of',
          from_id: person.id,
          to_id: otherId,
          status,
        })
        onRelationshipCreated(r)
      } else {
        const r = await createRelationship({ type: 'parent_of', from_id: person.id, to_id: otherId })
        onRelationshipCreated(r)
        if (coParentId) {
          const r2 = await createRelationship({ type: 'parent_of', from_id: coParentId, to_id: otherId })
          onRelationshipCreated(r2)
        }
      }

      setExistingId('')
      setNewName('')
      setNewGender('male')
      setCoParentId('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Thêm quan hệ thất bại.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 border-t border-stone-200 pt-3">
      <div className="flex gap-3 text-sm">
        <label className="flex items-center gap-1.5">
          <input type="radio" checked={mode === 'existing'} onChange={() => setMode('existing')} />
          Người đã có trong cây
        </label>
        <label className="flex items-center gap-1.5">
          <input type="radio" checked={mode === 'new'} onChange={() => setMode('new')} />
          Tạo người mới
        </label>
      </div>

      {mode === 'existing' ? (
        candidates.length === 0 ? (
          <p className="text-sm text-stone-400">Không có người phù hợp trong cây — hãy tạo người mới.</p>
        ) : (
          <select
            value={existingId}
            onChange={(e) => setExistingId(e.target.value)}
            className="rounded-md border border-stone-300 px-2 py-1.5 text-sm"
          >
            <option value="">— Chọn người —</option>
            {candidates.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name}
              </option>
            ))}
          </select>
        )
      ) : (
        <div className="flex gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Họ tên *"
            className="flex-1 rounded-md border border-stone-300 px-2 py-1.5 text-sm"
          />
          <select
            value={newGender}
            onChange={(e) => setNewGender(e.target.value as Gender)}
            className="rounded-md border border-stone-300 px-2 py-1.5 text-sm"
          >
            <option value="male">Nam</option>
            <option value="female">Nữ</option>
          </select>
        </div>
      )}

      {kind === 'spouse' && (
        <label className="flex flex-col gap-1 text-sm text-stone-600">
          Tình trạng
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as SpouseStatus)}
            className="rounded-md border border-stone-300 px-2 py-1.5"
          >
            <option value="married">Đang kết hôn</option>
            <option value="divorced">Đã ly hôn</option>
            <option value="widowed">Đã mất</option>
          </select>
        </label>
      )}

      {kind === 'child' && spouses.length > 0 && (
        <label className="flex flex-col gap-1 text-sm text-stone-600">
          Cùng với vợ/chồng nào? (con sẽ gắn với cả hai)
          <select
            value={coParentId}
            onChange={(e) => setCoParentId(e.target.value)}
            className="rounded-md border border-stone-300 px-2 py-1.5"
          >
            <option value="">Không chọn — chỉ 1 cha/mẹ</option>
            {spouses.map(({ person: p }) => (
              <option key={p.id} value={p.id}>
                {p.full_name}
              </option>
            ))}
          </select>
        </label>
      )}

      {warnings.map((w) => (
        <p key={w} className="text-xs text-amber-600">
          ⚠ {w}
        </p>
      ))}

      <button
        type="submit"
        disabled={busy}
        className="self-start rounded-md bg-stone-800 px-4 py-1.5 text-sm text-white hover:bg-stone-700 disabled:opacity-50"
      >
        {busy ? 'Đang thêm…' : `+ Thêm ${KIND_LABEL[kind].toLowerCase()}`}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  )
}
