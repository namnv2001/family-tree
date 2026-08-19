import { useRef, useState } from 'react'
import type { Person } from '../lib/people'
import { updatePerson } from '../lib/people'
import { deletePersonPhoto, uploadPersonPhoto } from '../lib/photos'
import { Avatar } from './Avatar'

// Upload là hành động rời rạc (không phải gõ liên tục) nên lưu ngay, không qua
// debounce của useAutosave — khác với các field text ở PersonRow.
export function PhotoField({
  treeId,
  person,
  onChanged,
}: {
  treeId: string
  person: Person
  onChanged: (p: Person) => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFile(file: File) {
    setBusy(true)
    setError(null)
    try {
      const path = await uploadPersonPhoto(treeId, person.id, file)
      await updatePerson(person.id, { photo_path: path })
      onChanged({ ...person, photo_path: path })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tải ảnh thất bại.')
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  async function handleRemove() {
    if (!person.photo_path) return
    setBusy(true)
    setError(null)
    try {
      await deletePersonPhoto(person.photo_path)
      await updatePerson(person.id, { photo_path: null })
      onChanged({ ...person, photo_path: null })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Xóa ảnh thất bại.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Avatar photoPath={person.photo_path} name={person.full_name} size={56} />
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        disabled={busy}
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void handleFile(file)
        }}
        className="text-sm"
      />
      {person.photo_path && (
        <button
          type="button"
          onClick={handleRemove}
          disabled={busy}
          className="text-sm text-red-600 hover:underline disabled:opacity-50"
        >
          Xóa ảnh
        </button>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  )
}
