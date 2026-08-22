import { supabase } from './supabase'

export type Gender = 'male' | 'female' | 'other'

export type Person = {
  id: string
  tree_id: string
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

export async function listPeople(treeId: string): Promise<Person[]> {
  const { data, error } = await supabase
    .from('people')
    .select('*')
    .eq('tree_id', treeId)
    .order('sibling_order', { ascending: true })
    .order('full_name', { ascending: true })
  if (error) throw error
  return data as Person[]
}

export async function createPerson(treeId: string, input: NewPerson): Promise<Person> {
  const { data, error } = await supabase
    .from('people')
    .insert({ tree_id: treeId, ...input })
    .select('*')
    .single()
  if (error) throw error
  return data as Person
}

export async function updatePerson(
  id: string,
  patch: Partial<Omit<Person, 'id' | 'tree_id'>>,
): Promise<void> {
  const { error } = await supabase.from('people').update(patch).eq('id', id)
  if (error) throw error
}

export async function deletePerson(id: string): Promise<void> {
  const { error } = await supabase.from('people').delete().eq('id', id)
  if (error) throw error
}

// FR-1.2: phải cảnh báo rõ trước khi xóa người còn quan hệ (cha/mẹ, vợ/chồng, con).
// Chưa có UI thêm quan hệ (M3) nên số này luôn 0 ở M1 — hàm để sẵn cho M3 dùng lại.
export async function countRelationships(personId: string): Promise<number> {
  const { count, error } = await supabase
    .from('relationships')
    .select('id', { count: 'exact', head: true })
    .or(`from_id.eq.${personId},to_id.eq.${personId}`)
  if (error) throw error
  return count ?? 0
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
