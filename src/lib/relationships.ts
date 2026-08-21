import type { Person } from './people'
import { supabase } from './supabase'

export type RelationshipType = 'parent_of' | 'spouse_of'
export type SpouseStatus = 'married' | 'divorced' | 'widowed'

export type Relationship = {
  id: string
  tree_id: string
  type: RelationshipType
  from_id: string
  to_id: string
  status: SpouseStatus | null
}

export async function listRelationships(treeId: string): Promise<Relationship[]> {
  const { data, error } = await supabase
    .from('relationships')
    .select('*')
    .eq('tree_id', treeId)
  if (error) throw error
  return data as Relationship[]
}

// FR-2.1: tạo quan hệ từ node. from_id/to_id theo đúng chiều schema
// (parent_of: from = cha/mẹ, to = con; spouse_of: không hướng, thứ tự không quan trọng).
export async function createRelationship(
  treeId: string,
  input: { type: RelationshipType; from_id: string; to_id: string; status?: SpouseStatus | null },
): Promise<Relationship> {
  const { data, error } = await supabase
    .from('relationships')
    .insert({ tree_id: treeId, status: null, ...input })
    .select('*')
    .single()
  if (error) throw error
  return data as Relationship
}

// FR-2.4: xóa liên kết, không đụng tới người.
export async function deleteRelationship(id: string): Promise<void> {
  const { error } = await supabase.from('relationships').delete().eq('id', id)
  if (error) throw error
}

// Sửa status của một liên kết spouse_of đã có (vd: "Đang kết hôn" -> "Đã mất"
// khi người kia qua đời). Đây là UPDATE tại chỗ, không phải tạo liên kết mới —
// khác với ca ly hôn-rồi-tái hôn CÙNG một người (đó mới cần 2 row riêng để giữ
// đủ lịch sử theo FR-2.3).
export async function updateRelationshipStatus(id: string, status: SpouseStatus): Promise<void> {
  const { error } = await supabase.from('relationships').update({ status }).eq('id', id)
  if (error) throw error
}

export type RelatedPerson = { rel: Relationship; person: Person }

function relatedBy(
  people: Person[],
  relationships: Relationship[],
  match: (r: Relationship) => string | null, // trả về id người liên quan, hoặc null nếu quan hệ này không khớp
): RelatedPerson[] {
  const byId = new Map(people.map((p) => [p.id, p]))
  const out: RelatedPerson[] = []
  for (const r of relationships) {
    const otherId = match(r)
    if (!otherId) continue
    const person = byId.get(otherId)
    if (person) out.push({ rel: r, person })
  }
  return out
}

// Cha/mẹ của personId — chỉ đọc từ mảng relationships đã tải sẵn, không gọi mạng.
export function parentsOf(personId: string, people: Person[], relationships: Relationship[]): RelatedPerson[] {
  return relatedBy(people, relationships, (r) =>
    r.type === 'parent_of' && r.to_id === personId ? r.from_id : null,
  )
}

export function childrenOf(personId: string, people: Person[], relationships: Relationship[]): RelatedPerson[] {
  return relatedBy(people, relationships, (r) =>
    r.type === 'parent_of' && r.from_id === personId ? r.to_id : null,
  )
}

// BFS ngược theo parent_of để lấy mọi tổ tiên (cha/mẹ, ông/bà, ...) của personId.
// Dùng để lọc danh sách chọn "con đã có sẵn": không cho chọn tổ tiên của chính
// mình làm con — chắc chắn bị trigger DB chặn (vòng lặp), lọc trước cho đỡ báo lỗi vô ích.
export function ancestorsOf(personId: string, relationships: Relationship[]): Set<string> {
  const out = new Set<string>()
  let frontier = [personId]
  while (frontier.length > 0) {
    const next: string[] = []
    for (const r of relationships) {
      if (r.type !== 'parent_of' || !frontier.includes(r.to_id) || out.has(r.from_id)) continue
      out.add(r.from_id)
      next.push(r.from_id)
    }
    frontier = next
  }
  return out
}

// Ngược lại: mọi hậu duệ (con, cháu, ...) của personId — lọc danh sách chọn
// "cha/mẹ đã có sẵn", cùng lý do như trên.
export function descendantsOf(personId: string, relationships: Relationship[]): Set<string> {
  const out = new Set<string>()
  let frontier = [personId]
  while (frontier.length > 0) {
    const next: string[] = []
    for (const r of relationships) {
      if (r.type !== 'parent_of' || !frontier.includes(r.from_id) || out.has(r.to_id)) continue
      out.add(r.to_id)
      next.push(r.to_id)
    }
    frontier = next
  }
  return out
}

export function spousesOf(personId: string, people: Person[], relationships: Relationship[]): RelatedPerson[] {
  return relatedBy(people, relationships, (r) => {
    if (r.type !== 'spouse_of') return null
    if (r.from_id === personId) return r.to_id
    if (r.to_id === personId) return r.from_id
    return null
  })
}

// FR-2.2 (cảnh báo, không chặn): lấy năm từ chuỗi ngày tự do kiểu '1920',
// '~1920', '12/1920' — chỉ cần con số 4 chữ số đầu tiên, không parse ngày đầy đủ.
function yearOf(date: string | null): number | null {
  const m = date?.match(/\d{4}/)
  return m ? Number(m[0]) : null
}

// AC: cảnh báo (không chặn) khi con sinh trước cha/mẹ, hoặc sinh sau khi mẹ
// mất hơn 1 năm. Trả về danh sách cảnh báo — rỗng nghĩa là không có gì bất thường.
export function dateWarnings(
  parent: Pick<Person, 'gender' | 'birth_date' | 'death_date'>,
  child: Pick<Person, 'birth_date'>,
): string[] {
  const warnings: string[] = []
  const parentBirth = yearOf(parent.birth_date)
  const childBirth = yearOf(child.birth_date)

  if (parentBirth !== null && childBirth !== null && childBirth < parentBirth) {
    warnings.push('Con có năm sinh trước cha/mẹ — kiểm tra lại ngày sinh.')
  }
  if (parent.gender === 'female') {
    const motherDeath = yearOf(parent.death_date)
    if (motherDeath !== null && childBirth !== null && childBirth > motherDeath + 1) {
      warnings.push('Con sinh sau ngày mất của mẹ hơn 1 năm — kiểm tra lại ngày sinh/ngày mất.')
    }
  }
  return warnings
}
