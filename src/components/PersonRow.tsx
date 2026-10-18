import { useState, type ReactNode } from 'react'
import type { Person } from '../lib/people'
import { formatLifespan, updatePerson } from '../lib/people'
import { AutosaveSkip, useAutosave, type SaveStatus } from '../lib/useAutosave'
import { Avatar } from './Avatar'
import { PhotoField } from './PhotoField'
import type { RelationshipKind } from './RelationshipModal'

const RELATION_LABEL: Record<RelationshipKind, string> = { parent: 'Cha/Mẹ', spouse: 'Vợ/Chồng', child: 'Con' }

type Draft = Pick<
  Person,
  'full_name' | 'alias' | 'gender' | 'birth_date' | 'death_date' | 'is_deceased' | 'note'
>

function toDraft(p: Person): Draft {
  return {
    full_name: p.full_name,
    alias: p.alias,
    gender: p.gender,
    birth_date: p.birth_date,
    death_date: p.death_date,
    is_deceased: p.is_deceased,
    note: p.note,
  }
}

export function PersonRow({
  person,
  relations,
  onEditRelations,
  onChanged,
  onDelete,
}: {
  person: Person
  relations: Record<RelationshipKind, string[]>
  onEditRelations: (kind: RelationshipKind) => void
  onChanged: (p: Person) => void
  onDelete: () => void
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<Draft>(() => toDraft(person))

  const status = useAutosave(draft, async (value) => {
    // FR-1.1: họ tên bắt buộc — đừng lưu bản trống, giữ nguyên bản cũ trên server.
    if (!value.full_name.trim()) throw new AutosaveSkip()
    await updatePerson(person.id, value)
    onChanged({ ...person, ...value })
  })

  const deceased = person.is_deceased || !!person.death_date // FR-1.4

  return (
    <div
      className={`rounded-xl border shadow-sm transition-shadow hover:shadow-md ${deceased ? 'border-stone-400 bg-stone-50' : 'border-stone-200 bg-white'}`}
    >
      <div className="flex items-center gap-2 p-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-lg p-1 text-left hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-stone-800"
        >
          <Avatar photoPath={person.photo_path} name={person.full_name} grayscale={deceased} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-stone-800">
              {person.full_name}
              {person.alias && <span className="ml-1 text-stone-400">({person.alias})</span>}
            </p>
            <p className="text-sm text-stone-500">{formatLifespan(person)}</p>
          </div>
          <span className="shrink-0 rounded-md px-2 py-1 text-sm text-stone-600">
            {open ? 'Đóng ▴' : 'Sửa ▾'}
          </span>
        </button>
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Xóa ${person.full_name}`}
          className="shrink-0 rounded-md px-2 py-1 text-sm text-red-600 hover:bg-red-50"
        >
          Xóa
        </button>
      </div>

      {open && (
        <div className="grid gap-3 border-t border-stone-200 p-3 sm:grid-cols-2">
          <TextField
            label="Họ tên *"
            value={draft.full_name}
            onChange={(v) => setDraft((d) => ({ ...d, full_name: v }))}
          />
          <TextField
            label="Tên gọi khác"
            value={draft.alias ?? ''}
            onChange={(v) => setDraft((d) => ({ ...d, alias: v || null }))}
          />
          <label className="flex flex-col gap-1 text-sm text-stone-600">
            Giới tính
            <select
              // Dữ liệu cũ (trước khi bỏ "Không rõ"/"Khác") có thể còn null/'other'
              // — 2 option đó không còn trong danh sách nên hiển thị tạm về Nam,
              // KHÔNG tự ghi đè draft.gender (chỉ đổi thật khi người dùng chọn lại).
              value={draft.gender === 'female' ? 'female' : 'male'}
              onChange={(e) => setDraft((d) => ({ ...d, gender: e.target.value as Draft['gender'] }))}
              className="rounded-md border border-stone-300 px-2 py-1.5"
            >
              <option value="male">Nam</option>
              <option value="female">Nữ</option>
            </select>
          </label>
          <label className="flex items-center gap-2 self-end pb-1.5 text-sm text-stone-600">
            <input
              type="checkbox"
              checked={draft.is_deceased}
              onChange={(e) => setDraft((d) => ({ ...d, is_deceased: e.target.checked }))}
            />
            Đã mất
          </label>
          <TextField
            label="Ngày sinh"
            value={draft.birth_date ?? ''}
            onChange={(v) => setDraft((d) => ({ ...d, birth_date: v || null }))}
            placeholder="1920 hoặc khoảng 1920"
          />
          <TextField
            label="Ngày mất"
            value={draft.death_date ?? ''}
            onChange={(v) => setDraft((d) => ({ ...d, death_date: v || null }))}
          />
          <label className="flex flex-col gap-1 text-sm text-stone-600 sm:col-span-2">
            Ghi chú
            <textarea
              value={draft.note ?? ''}
              onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value || null }))}
              rows={2}
              className="rounded-md border border-stone-300 px-2 py-1.5"
            />
          </label>

          <div className="flex flex-col gap-1 text-sm text-stone-600 sm:col-span-2">
            Quan hệ
            <div className="flex flex-col divide-y divide-stone-200 rounded-md border border-stone-300">
              {(Object.keys(RELATION_LABEL) as RelationshipKind[]).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => onEditRelations(kind)}
                  className="flex items-center gap-2 px-3 py-2 text-left hover:bg-stone-50"
                >
                  <span className="w-20 shrink-0 text-stone-500">{RELATION_LABEL[kind]}</span>
                  <span className={`min-w-0 flex-1 truncate ${relations[kind].length ? 'text-stone-800' : 'text-stone-400'}`}>
                    {relations[kind].join(', ') || 'Chưa có'}
                  </span>
                  <span className="shrink-0 text-stone-500">{relations[kind].length ? 'Sửa' : '+ Thêm'}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="sm:col-span-2">
            <PhotoField person={person} onChanged={onChanged} />
          </div>

          <div className="sm:col-span-2">
            <SaveStatusLabel status={status} />
          </div>
        </div>
      )}
    </div>
  )
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <label className="flex flex-col gap-1 text-sm text-stone-600">
      {label}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="rounded-md border border-stone-300 px-2 py-1.5"
      />
    </label>
  )
}

function SaveStatusLabel({ status }: { status: SaveStatus }): ReactNode {
  switch (status) {
    case 'saving':
      return <span className="text-sm text-stone-400">Đang lưu…</span>
    case 'saved':
      return <span className="text-sm text-green-600">Đã lưu ✓</span>
    case 'offline':
      return <span className="text-sm text-amber-600">Chưa lưu — mất mạng, đang tự thử lại…</span>
    case 'invalid':
      return <span className="text-sm text-red-600">Chưa lưu — cần họ tên</span>
    default:
      return null
  }
}
