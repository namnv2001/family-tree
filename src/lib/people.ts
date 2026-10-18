import { deletePersonPhoto } from './photos'
import { loadTree, mutate } from './store'

export type Gender = 'male' | 'female' | 'other'

export type Person = {
  id: string
  full_name: string
  alias: string | null
  gender: Gender | null
  birth_date: string | null
  death_date: string | null
  is_deceased: boolean
  photo_path: string | null
  note: string | null
  sibling_order: number
}

export type NewPerson = {
  full_name: string
  gender?: Gender | null
  birth_date?: string | null
}

export async function listPeople(): Promise<Person[]> {
  const { people } = await loadTree()
  return [...people].sort(
    (a, b) => a.sibling_order - b.sibling_order || a.full_name.localeCompare(b.full_name, 'vi'),
  )
}

export async function createPerson(input: NewPerson): Promise<Person> {
  if (!input.full_name.trim()) throw new Error('Cần nhập họ tên.')
  const person: Person = {
    id: crypto.randomUUID(),
    full_name: input.full_name,
    alias: null,
    gender: input.gender ?? null,
    birth_date: input.birth_date ?? null,
    death_date: null,
    is_deceased: false,
    photo_path: null,
    note: null,
    sibling_order: 0,
  }
  await mutate((d) => d.people.push(person))
  return person
}

// Thay object mới thay vì sửa tại chỗ — component đang giữ tham chiếu tới object cũ trong state.
export async function updatePerson(id: string, patch: Partial<Omit<Person, 'id'>>): Promise<void> {
  await mutate((d) => {
    d.people = d.people.map((p) => (p.id === id ? { ...p, ...patch } : p))
  })
}

export async function deletePerson(id: string): Promise<void> {
  const { people } = await loadTree()
  const photo = people.find((p) => p.id === id)?.photo_path
  await mutate((d) => {
    d.people = d.people.filter((p) => p.id !== id)
    d.relationships = d.relationships.filter((r) => r.from_id !== id && r.to_id !== id)
  })
  if (photo) await deletePersonPhoto(photo)
}

// Lưu thứ tự anh chị em theo đúng thứ tự mảng ids (lớn → nhỏ), một lần ghi.
export async function setSiblingOrder(ids: string[]): Promise<void> {
  await mutate((d) => {
    d.people = d.people.map((p) => (ids.includes(p.id) ? { ...p, sibling_order: ids.indexOf(p.id) + 1 } : p))
  })
}

// Thứ tự xếp tay (sibling_order) thắng năm sinh: gia phả hay thiếu năm sinh của
// vài người, so năm trước thì những người thiếu năm không xếp được. Chưa xếp tay
// (cùng 0) thì mới theo năm sinh, lớn tuổi trước.
export function compareSiblings(
  a: Pick<Person, 'sibling_order' | 'birth_date'>,
  b: Pick<Person, 'sibling_order' | 'birth_date'>,
): number {
  if (a.sibling_order !== b.sibling_order) return a.sibling_order - b.sibling_order
  const ay = a.birth_date?.match(/\d{4}/)?.[0]
  const by = b.birth_date?.match(/\d{4}/)?.[0]
  if (ay && by) return Number(ay) - Number(by)
  return ay ? -1 : by ? 1 : 0
}

// FR-1.2: phải cảnh báo rõ trước khi xóa người còn quan hệ (cha/mẹ, vợ/chồng, con).
export async function countRelationships(personId: string): Promise<number> {
  const { relationships } = await loadTree()
  return relationships.filter((r) => r.from_id === personId || r.to_id === personId).length
}

// FR-4.1: bỏ dấu để so khớp gần đúng — "nguyen van" phải khớp "Nguyễn Văn A".
// Một dòng stdlib đủ dùng (đã chốt ở plan.md mục 1), không cần lib fuzzy-search riêng.
export function stripDiacritics(s: string): string {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '')
}

// So khớp theo họ tên hoặc tên gọi khác, không phân biệt hoa/thường và dấu.
export function matchesName(person: Pick<Person, 'full_name' | 'alias'>, query: string): boolean {
  const q = stripDiacritics(query.trim().toLowerCase())
  if (!q) return false
  if (stripDiacritics(person.full_name.toLowerCase()).includes(q)) return true
  return !!person.alias && stripDiacritics(person.alias.toLowerCase()).includes(q)
}

// FR-1.4: nhãn "năm sinh – năm mất" khi người đã mất, "Sinh {năm}" khi còn sống.
export function formatLifespan(
  p: Pick<Person, 'birth_date' | 'death_date' | 'is_deceased'>,
): string {
  const deceased = p.is_deceased || !!p.death_date
  if (!deceased) return p.birth_date ? `Sinh ${p.birth_date}` : ''
  if (!p.birth_date && !p.death_date) return 'Đã mất'
  return `${p.birth_date ?? '?'} – ${p.death_date ?? '?'}`
}
