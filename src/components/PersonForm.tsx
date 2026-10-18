import { useRef, useState, type FormEvent, type ReactNode } from 'react'
import type { Gender, NewPerson, Person } from '../lib/people'
import { spousesOf, STATUS_LABEL, type Relationship, type SpouseStatus } from '../lib/relationships'
import { PersonCombobox } from './PersonCombobox'

export type NewPersonLinks = { parentIds: string[]; spouse: { id: string; status: SpouseStatus } | null }

export function PersonForm({
  people,
  relationships,
  onAdd,
}: {
  people: Person[]
  relationships: Relationship[]
  onAdd: (input: NewPerson, links: NewPersonLinks) => Promise<void>
}) {
  const [fullName, setFullName] = useState('')
  const [parentId, setParentId] = useState('')
  const [coParentId, setCoParentId] = useState('')
  const [spouseId, setSpouseId] = useState('')
  const [spouseStatus, setSpouseStatus] = useState<SpouseStatus>('married')
  const [gender, setGender] = useState<Gender>('male')
  const [birthDate, setBirthDate] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const name = fullName.trim()
    if (!name) {
      setError('Cần nhập họ tên.') // FR-1.1: bắt buộc họ tên, thiếu → không lưu, lỗi tại field
      return
    }
    setBusy(true)
    setError(null)
    try {
      await onAdd(
        { full_name: name, gender, birth_date: birthDate.trim() || null },
        {
          parentIds: [parentId, coParentId].filter(Boolean),
          spouse: spouseId ? { id: spouseId, status: spouseStatus } : null,
        },
      )
      setFullName('')
      setGender('male')
      setBirthDate('')
      setSpouseId('')
      setSpouseStatus('married')
      // Giữ nguyên cha/mẹ đã chọn: thường nhập liền một lượt cả nhà anh chị em.
      nameRef.current?.focus()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Thêm thất bại.')
    } finally {
      setBusy(false)
    }
  }

  const spouses = parentId ? spousesOf(parentId, people, relationships) : []

  function chooseParent(id: string) {
    setParentId(id)
    const options = id ? spousesOf(id, people, relationships) : []
    setCoParentId(options.length === 1 ? options[0]!.person.id : '')
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-wrap items-end gap-3 rounded-lg border border-stone-200 p-3"
    >
      <Field label="Họ tên *">
        <input
          ref={nameRef}
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Nguyễn Văn A"
          className="rounded-md border border-stone-300 px-2 py-1.5"
        />
      </Field>
      <Field label="Giới tính">
        <select
          value={gender}
          onChange={(e) => setGender(e.target.value as Gender)}
          className="rounded-md border border-stone-300 px-2 py-1.5"
        >
          <option value="male">Nam</option>
          <option value="female">Nữ</option>
        </select>
      </Field>
      <Field label="Năm sinh">
        <input
          value={birthDate}
          onChange={(e) => setBirthDate(e.target.value)}
          placeholder="1920 hoặc khoảng 1920"
          className="w-44 rounded-md border border-stone-300 px-2 py-1.5"
        />
      </Field>
      {people.length > 0 && (
        <Field label="Con của">
          <PersonCombobox
            people={people}
            selectedId={parentId}
            onSelect={(p) => chooseParent(p?.id ?? '')}
            placeholder="Gõ tên cha/mẹ…"
            label="Con của"
            className="w-56"
          />
        </Field>
      )}
      {spouses.length > 0 && (
        <Field label="và">
          <select
            value={coParentId}
            onChange={(e) => setCoParentId(e.target.value)}
            className="max-w-56 rounded-md border border-stone-300 px-2 py-1.5"
          >
            <option value="">— Chỉ một cha/mẹ —</option>
            {spouses.map(({ person: s }) => (
              <option key={s.id} value={s.id}>
                {s.full_name}
              </option>
            ))}
          </select>
        </Field>
      )}
      {people.length > 0 && (
        <Field label="Vợ/Chồng của">
          <PersonCombobox
            people={people.filter((p) => p.id !== parentId && p.id !== coParentId)}
            selectedId={spouseId}
            onSelect={(p) => setSpouseId(p?.id ?? '')}
            placeholder="Gõ tên vợ/chồng…"
            label="Vợ/Chồng của"
            className="w-56"
          />
        </Field>
      )}
      {spouseId && (
        <Field label="Tình trạng">
          <select
            value={spouseStatus}
            onChange={(e) => setSpouseStatus(e.target.value as SpouseStatus)}
            className="rounded-md border border-stone-300 px-2 py-1.5"
          >
            {(Object.keys(STATUS_LABEL) as SpouseStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </Field>
      )}
      <button
        type="submit"
        disabled={busy}
        className="rounded-md bg-stone-800 px-4 py-1.5 text-white hover:bg-stone-700 disabled:opacity-50"
      >
        {busy ? 'Đang thêm…' : '+ Thêm người'}
      </button>
      {error && <p className="w-full text-sm text-red-600">{error}</p>}
    </form>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm text-stone-600">
      {label}
      {children}
    </label>
  )
}
