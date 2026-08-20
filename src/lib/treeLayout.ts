import calcTree from 'relatives-tree'
import type { Connector, Gender, Node as RTNode, Relation, RelType } from 'relatives-tree/lib/types'
import type { Person } from './people'
import type { Relationship } from './relationships'

// Gender/RelType là `declare const enum` trong .d.ts của lib — import kiểu
// (`import type`) thì luôn an toàn (bị erase lúc build, không sinh mã chạy
// thật). Cái KHÔNG an toàn là import chúng như giá trị (`RelType.blood`) rồi
// dùng xuyên module: Vite/rolldown transpile từng file riêng lẻ (kiểu esbuild),
// không inline được const enum ngoài file khai báo. Nên chỉ dùng chuỗi literal
// ('blood', 'male', ...) rồi cast 1 lần ở `rel()`/`castGender()` dưới đây.
const rel = (id: string, type: 'blood' | 'half' | 'married' | 'divorced'): Relation => ({
  id,
  type: type as RelType,
})
const castGender = (gender: 'male' | 'female'): Gender => gender as Gender

export type PositionedPerson = Person & { left: number; top: number }

export type TreeLayout = {
  nodes: PositionedPerson[]
  connectors: Connector[]
  canvas: { width: number; height: number }
  /** id gốc của cây con đầu tiên — dùng cho nút "về gốc" (FR-3.2). */
  primaryRootId: string | null
}

// Khoảng cách (đơn vị lưới của lib, cùng đơn vị với SIZE=2 trong constants.ts
// của relatives-tree) giữa 2 cây con không liên quan tới nhau — ví dụ người
// mới thêm ở M1 chưa có quan hệ nào thì mỗi người là một "cây" riêng.
const COMPONENT_GAP_UNITS = 4

// relatives-tree cần gender 'male'|'female' cho MỖI node để quyết định thứ tự
// trái/phải khi xếp cặp vợ chồng — không phải giới tính hiển thị. Field gender
// thật (kể cả 'other' / chưa rõ) vẫn giữ nguyên ở DB và trên UI, chỗ này chỉ
// là input riêng cho thuật toán layout.
function toLibGender(gender: Person['gender']): Gender {
  return castGender(gender === 'female' ? 'female' : 'male')
}

// 'widowed': từng thật sự kết hôn (không phải ly hôn) nên xếp cùng nhóm với
// 'married' cho đúng cấu trúc gia đình. Nét đứt cho ly hôn/đã mất là việc của
// UI render connector ở M3 (FR-2.3), không phải input cho thuật toán layout.
function toLibSpouseType(status: Relationship['status']): 'married' | 'divorced' {
  return status === 'divorced' ? 'divorced' : 'married'
}

type Graph = {
  parentsOf: Map<string, string[]>
  childrenOf: Map<string, string[]>
  spousesOf: Map<string, Relation[]>
}

function buildGraph(people: Person[], relationships: Relationship[]): Graph {
  const ids = new Set(people.map((p) => p.id))
  const parentsOf = new Map<string, string[]>()
  const childrenOf = new Map<string, string[]>()
  const spousesOf = new Map<string, Relation[]>()
  for (const p of people) {
    parentsOf.set(p.id, [])
    childrenOf.set(p.id, [])
    spousesOf.set(p.id, [])
  }

  for (const r of relationships) {
    // Dữ liệu mồ côi (người đã bị xóa nhưng quan hệ còn sót) — bỏ qua, đừng throw.
    if (!ids.has(r.from_id) || !ids.has(r.to_id)) continue
    if (r.type === 'parent_of') {
      parentsOf.get(r.to_id)!.push(r.from_id)
      childrenOf.get(r.from_id)!.push(r.to_id)
    } else {
      const type = toLibSpouseType(r.status)
      spousesOf.get(r.from_id)!.push(rel(r.to_id, type))
      spousesOf.get(r.to_id)!.push(rel(r.from_id, type))
    }
  }

  return { parentsOf, childrenOf, spousesOf }
}

// Anh/chị/em suy ra từ cha mẹ chung, không lưu riêng (đúng mô hình dữ liệu
// requirements.md mục 3): chung đủ cả bộ cha mẹ → 'blood', chung một phần → 'half'.
function siblingsOf(personId: string, people: Person[], graph: Graph): Relation[] {
  const mine = new Set(graph.parentsOf.get(personId))
  if (mine.size === 0) return []
  const out: Relation[] = []
  for (const other of people) {
    if (other.id === personId) continue
    const theirs = graph.parentsOf.get(other.id) ?? []
    const shared = theirs.filter((id) => mine.has(id))
    if (shared.length === 0) continue
    const sameSet = shared.length === mine.size && theirs.length === mine.size
    out.push(rel(other.id, sameSet ? 'blood' : 'half'))
  }
  return out
}

function buildRTNodes(people: Person[], relationships: Relationship[]): RTNode[] {
  const graph = buildGraph(people, relationships)
  const blood = (id: string): Relation => rel(id, 'blood')

  return people.map((p) => ({
    id: p.id,
    gender: toLibGender(p.gender),
    parents: graph.parentsOf.get(p.id)!.map(blood),
    children: graph.childrenOf.get(p.id)!.map(blood),
    siblings: siblingsOf(p.id, people, graph),
    spouses: graph.spousesOf.get(p.id)!,
  }))
}

// Cây gia phả thật không phải lúc nào cũng liền một mảnh: người mới thêm ở M1
// chưa gắn quan hệ nào, hoặc 2 nhánh họ chưa nối tới nhau. `relatives-tree`
// chỉ xếp được các node nối tới đúng 1 rootId — nên phải tách theo từng thành
// phần liên thông (BFS trên cạnh parent_of + spouse_of) rồi xếp riêng từng
// cây, đừng để người không có quan hệ nào biến mất khỏi màn hình.
function findComponents(people: Person[], relationships: Relationship[]): string[][] {
  const adjacency = new Map<string, Set<string>>()
  for (const p of people) adjacency.set(p.id, new Set())
  for (const r of relationships) {
    if (!adjacency.has(r.from_id) || !adjacency.has(r.to_id)) continue
    adjacency.get(r.from_id)!.add(r.to_id)
    adjacency.get(r.to_id)!.add(r.from_id)
  }

  const seen = new Set<string>()
  const components: string[][] = []
  for (const p of people) {
    if (seen.has(p.id)) continue
    const queue = [p.id]
    const comp: string[] = []
    seen.add(p.id)
    while (queue.length > 0) {
      const id = queue.shift()!
      comp.push(id)
      for (const next of adjacency.get(id)!) {
        if (seen.has(next)) continue
        seen.add(next)
        queue.push(next)
      }
    }
    components.push(comp)
  }
  return components
}

// Gốc của một thành phần: người không có parent nào trong dữ liệu (tổ tiên
// cao nhất được ghi nhận). Vợ/chồng của gốc tự động được lib kéo vào cùng
// hàng — không cần chọn đúng người trong cặp.
function pickRoot(compIds: string[], graph: Graph): string {
  return compIds.find((id) => graph.parentsOf.get(id)!.length === 0) ?? compIds[0]!
}

export function buildTreeLayout(people: Person[], relationships: Relationship[]): TreeLayout {
  if (people.length === 0) return { nodes: [], connectors: [], canvas: { width: 0, height: 0 }, primaryRootId: null }

  const graph = buildGraph(people, relationships)
  const rtNodes = buildRTNodes(people, relationships)
  const personById = new Map(people.map((p) => [p.id, p]))
  const components = findComponents(people, relationships)

  const nodes: PositionedPerson[] = []
  const connectors: Connector[] = []
  let offsetX = 0
  let maxHeight = 0
  let primaryRootId: string | null = null

  for (const compIds of components) {
    const compIdSet = new Set(compIds)
    const compNodes = rtNodes.filter((n) => compIdSet.has(n.id))
    const rootId = pickRoot(compIds, graph)
    if (primaryRootId === null) primaryRootId = rootId

    const result = calcTree(compNodes, { rootId })
    for (const n of result.nodes) {
      const person = personById.get(n.id)
      if (!person) continue
      nodes.push({ ...person, left: n.left + offsetX, top: n.top })
    }
    for (const [x1, y1, x2, y2] of result.connectors) {
      connectors.push([x1 + offsetX, y1, x2 + offsetX, y2])
    }
    offsetX += result.canvas.width + COMPONENT_GAP_UNITS
    maxHeight = Math.max(maxHeight, result.canvas.height)
  }

  return {
    nodes,
    connectors,
    canvas: { width: Math.max(offsetX - COMPONENT_GAP_UNITS, 0), height: maxHeight },
    primaryRootId,
  }
}
