import { useState, type FormEvent, type ReactNode } from 'react'
import type { Gender, NewPerson } from '../lib/people'

export function PersonForm({ onAdd }: { onAdd: (input: NewPerson) => Promise<void> }) {
  const [fullName, setFullName] = useState('')
  const [gender, setGender] = useState<Gender | ''>('')
  const [birthDate, setBirthDate] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

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
      await onAdd({ full_name: name, gender: gender || null, birth_date: birthDate.trim() || null })
      setFullName('')
      setGender('')
      setBirthDate('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Thêm thất bại.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-wrap items-end gap-3 rounded-lg border border-stone-200 p-3"
    >
      <Field label="Họ tên *">
        <input
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Nguyễn Văn A"
          className="rounded-md border border-stone-300 px-2 py-1.5"
        />
      </Field>
      <Field label="Giới tính">
        <select
          value={gender}
          onChange={(e) => setGender(e.target.value as Gender | '')}
          className="rounded-md border border-stone-300 px-2 py-1.5"
        >
          <option value="">Không rõ</option>
          <option value="male">Nam</option>
          <option value="female">Nữ</option>
          <option value="other">Khác</option>
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
