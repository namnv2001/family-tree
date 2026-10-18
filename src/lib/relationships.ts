import { compareSiblings, type Person } from './people'
import { loadTree, mutate } from './store'

export type RelationshipType = 'parent_of' | 'spouse_of'
export type SpouseStatus = 'married' | 'divorced' | 'widowed'

export type Relationship = {
  id: string
  type: RelationshipType
  from_id: string
  to_id: string
  status: SpouseStatus | null
}

export async function listRelationships(): Promise<Relationship[]> {
  return [...(await loadTree()).relationships]
}

// FR-2.1: tạo quan hệ từ node. from_id/to_id theo đúng chiều
// (parent_of: from = cha/mẹ, to = con; spouse_of: không hướng, thứ tự không quan trọng).
export async function createRelationship(input: {
  type: RelationshipType
  from_id: string
  to_id: string
  status?: SpouseStatus | null
}): Promise<Relationship> {
  const { relationships } = await loadTree()
  assertValidRelationship(input, relationships)
  const rel: Relationship = { id: crypto.randomUUID(), status: null, ...input }
  await mutate((d) => d.relationships.push(rel))
  return rel
}

// FR-2.2: các ràng buộc trước đây do constraint/trigger Postgres giữ.
export function assertValidRelationship(
  input: Pick<Relationship, 'type' | 'from_id' | 'to_id'>,
  relationships: Relationship[],
): void {
  const { type, from_id, to_id } = input
  if (from_id === to_id) throw new Error('Không thể tạo quan hệ với chính mình.')
  const sameType = relationships.filter((r) => r.type === type)
  if (type === 'spouse_of') {
    if (sameType.some((r) => (r.from_id === from_id && r.to_id === to_id) || (r.from_id === to_id && r.to_id === from_id)))
      throw new Error('Hai người này đã là vợ/chồng.')
    return
  }
  if (sameType.some((r) => r.from_id === from_id && r.to_id === to_id)) throw new Error('Quan hệ này đã có.')
  if (sameType.filter((r) => r.to_id === to_id).length >= 2) throw new Error('Người này đã có đủ 2 cha/mẹ.')
  if (ancestorsOf(from_id, relationships).has(to_id))
    throw new Error('Không thể tạo quan hệ này: sẽ tạo vòng lặp tổ tiên.')
}

// FR-2.4: xóa liên kết, không đụng tới người.
export async function deleteRelationship(id: string): Promise<void> {
  await mutate((d) => {
    d.relationships = d.relationships.filter((r) => r.id !== id)
  })
}

// Sửa status của một liên kết spouse_of đã có (vd: "Đang kết hôn" -> "Đã mất"
// khi người kia qua đời) — sửa tại chỗ, không tạo liên kết mới.
export async function updateRelationshipStatus(id: string, status: SpouseStatus): Promise<void> {
  await mutate((d) => {
    d.relationships = d.relationships.map((r) => (r.id === id ? { ...r, status } : r))
  })
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
  ).sort((a, b) => compareSiblings(a.person, b.person))
}

// BFS ngược theo parent_of để lấy mọi tổ tiên (cha/mẹ, ông/bà, ...) của personId.
// Dùng để lọc danh sách chọn "con đã có sẵn": không cho chọn tổ tiên của chính
// mình làm con — chắc chắn bị assertValidRelationship chặn (vòng lặp), lọc trước cho đỡ báo lỗi vô ích.
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

// FR-3.3: toàn bộ người sẽ biến mất khỏi cây khi thu gọn nhánh dưới personId —
// con/cháu... huyết thống (descendantsOf) CỘNG vợ/chồng của từng người đó (rể/
// dâu married vào nhánh phải ẩn theo, không thì họ nổi lơ lửng không còn cha/
// mẹ/con nào hiển thị cạnh mình). KHÔNG ẩn vợ/chồng của chính personId — cặp đó
// vẫn là "gốc" của nhánh đang thu gọn, phải giữ lại để còn thấy nút mở lại.
export function collapsedBranchIds(
  personId: string,
  people: Person[],
  relationships: Relationship[],
): Set<string> {
  const hidden = descendantsOf(personId, relationships)
  for (const id of [...hidden]) {
    for (const { person } of spousesOf(id, people, relationships)) hidden.add(person.id)
  }
  return hidden
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
