import calcTree from 'relatives-tree'
import type { Connector, Gender, Node as RTNode, Relation, RelType } from 'relatives-tree/lib/types'
import { compareSiblings, type Person } from './people'
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

// FR-2.3: đường nối vợ/chồng phải vẽ khác nhau theo `status` (nét đứt cho ly
// hôn/đã mất, nét liền cho đang hôn) — thứ mà connector chung của relatives-tree
// không biết (nó chỉ trả về tọa độ, không có ngữ nghĩa "đây là quan hệ nào").
export type SpouseConnector = { x1: number; y1: number; x2: number; y2: number; dashed: boolean }

export type TreeLayout = {
  nodes: PositionedPerson[]
  connectors: Connector[]
  spouseConnectors: SpouseConnector[]
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

// relatives-tree xếp con trái→phải đúng theo thứ tự mảng `children` truyền vào
// (đã xác nhận bằng spike tọa độ), nên sort input là đủ.
function bySiblingOrder(personById: Map<string, Person>) {
  return (aId: string, bId: string): number => {
    const a = personById.get(aId)
    const b = personById.get(bId)
    return a && b ? compareSiblings(a, b) : 0
  }
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

  // relatives-tree chỉ xếp đúng vị trí 2 cha/mẹ của một người (đứng cạnh nhau,
  // con nối xuống từ giữa) khi 2 người đó nằm trong `spouses` của nhau. Dữ liệu
  // thật không phải lúc nào cũng vậy — 2 cha/mẹ ruột chưa từng khai spouse_of
  // trong app, hoặc cha/mẹ đơn thân nhận thêm 1 cha/mẹ nữa sau. Thiếu cặp
  // spouse thì lib KHÔNG throw, nó âm thầm loại người thứ 2 khỏi cây (bug quan
  // sát được, xem lịch sử sửa). Nên với mọi cặp cùng có con chung mà chưa có
  // spouse_of thật, tự thêm một cặp "spouse" ảo CHỈ để tính layout — không ghi
  // DB, không ảnh hưởng nét đứt/liền (chỗ đó đọc thẳng từ `relationships` thật
  // qua buildSpouseConnectors, không đọc map này).
  for (const [, parents] of parentsOf) {
    if (parents.length !== 2) continue
    const [a, b] = parents
    if (spousesOf.get(a)!.some((s) => s.id === b)) continue
    spousesOf.get(a)!.push(rel(b, 'married'))
    spousesOf.get(b)!.push(rel(a, 'married'))
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
  const personById = new Map(people.map((p) => [p.id, p]))
  const siblingOrder = bySiblingOrder(personById)
  const blood = (id: string): Relation => rel(id, 'blood')

  return people.map((p) => ({
    id: p.id,
    gender: toLibGender(p.gender),
    parents: graph.parentsOf.get(p.id)!.map(blood),
    children: [...graph.childrenOf.get(p.id)!].sort(siblingOrder).map(blood),
    siblings: siblingsOf(p.id, people, graph),
    // "vợ 1" đứng gần chồng nhất, các vợ sau xa dần (relatives-tree luôn đặt
    // vợ/chồng "đang kết hôn" cạnh nhau trước, các vợ/chồng khác xếp tiếp theo
    // đúng thứ tự phần tử trong mảng này — xem giải thích ở buildTreeLayout).
    spouses: [...graph.spousesOf.get(p.id)!].sort(
      (a, b) => (personById.get(a.id)?.sibling_order ?? 0) - (personById.get(b.id)?.sibling_order ?? 0),
    ),
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
//
// Bug đã xác nhận bằng spike: `relatives-tree` CHỈ vẽ đúng MỘT nhánh tổ tiên
// duy nhất — nhánh của chính `rootId`. Nếu root là người không có cha/mẹ chỉ
// vì CHƯA NHẬP (ví dụ rể chưa khai cha/mẹ ruột), còn vợ/chồng của người đó lại
// có cha/mẹ ghi nhận, thì cha/mẹ vợ/chồng đó bị lib ÂM THẦM LOẠI KHỎI CÂY dù
// vẫn cùng một thành phần liên thông truyền vào calcTree — không phải bug ở
// buildGraph/findComponents, chỉ là chọn nhầm root. Nên trong số các ứng viên
// "không có cha/mẹ", ưu tiên người có vợ/chồng CŨNG không có cha/mẹ (đầu nhánh
// thật) trước — chỉ chấp nhận ứng viên có vợ/chồng đã có cha/mẹ khi không còn
// lựa chọn nào khác.
// **Giới hạn đã biết:** cách này chỉ cứu được ca "1 người rể/dâu chưa rõ gốc
// gác kết hôn vào 1 nhánh có gốc rõ ràng". Nếu CÙNG một cây có từ 2 nhánh rể/
// dâu trở lên, mỗi nhánh có cha/mẹ riêng ở các đời khác nhau (ví dụ vừa có cha/
// mẹ vợ của đời 1 vừa có cha/mẹ vợ của đời 3) — `relatives-tree` không có cách
// nào vẽ đủ cả hai cùng lúc, vì rootId chỉ chọn được một nhánh. Chấp nhận vì
// đây là giới hạn cấu trúc của thư viện (một cây = một nhánh tổ tiên), không
// phải lỗi có thể sửa ở tầng chọn root.
//
// Trong SỐ các ứng viên "sạch" (hoặc toàn bộ ứng viên nếu không ai sạch), ưu
// tiên người không phải nữ (nam/chưa rõ, đúng quy ước toLibGender) vì 2 lý do
// đã xác nhận bằng thực nghiệm:
// 1. Nếu gốc có vợ/chồng riêng (cả 2 đều không có parent) — relatives-tree
//    LUÔN đặt chính node gốc bên trái trong cặp của nó, không xét giới tính gì
//    cả. Chọn gốc là người chồng thì "chồng bên trái" tự đúng.
// 2. Giới tính của gốc còn được lib dùng làm MỐC xếp trái/phải cho MỌI cặp
//    vợ/chồng KHÁC trong cả cây (không phải xét riêng từng cặp) — gốc nam thì
//    chồng luôn bên trái ở mọi cặp, gốc nữ thì lật ngược toàn bộ.
// Không có ứng viên nam thì đành chịu là nữ (ca mẹ đơn thân không rõ cha) —
// vẫn ép gender khi gọi calcTree (xem buildTreeLayout) để đời sau ít nhất còn
// đúng quy ước.
function pickRoot(compIds: string[], graph: Graph, personById: Map<string, Person>): string {
  const candidates = compIds.filter((id) => graph.parentsOf.get(id)!.length === 0)
  if (candidates.length === 0) return compIds[0]!

  const noInLawAbove = (id: string) =>
    graph.spousesOf.get(id)!.every((s) => graph.parentsOf.get(s.id)!.length === 0)
  const clean = candidates.filter(noInLawAbove)
  const pool = clean.length > 0 ? clean : candidates

  return pool.find((id) => personById.get(id)?.gender !== 'female') ?? pool[0]!
}

// relatives-tree đặt mỗi cặp vợ/chồng nằm cùng hàng, tâm 2 node cách nhau đúng
// 2 đơn vị lưới (đã xác nhận bằng spike: calcTree([P,W1,W2],...) cho connector
// [1,1,3,1] và [3,1,5,1] khi node ở left=0,2,4 cùng top=0 — tức đúng tâm-tới-tâm).
// Nên không cần đọc `connectors` chung để tìm đoạn vợ/chồng: tự tính lại từ vị
// trí node theo `relationships`, rồi lọc trùng đoạn đó khỏi connector chung để
// khỏi vẽ đè 2 lần (một nét xám mặc định của lib + một nét màu/đứt của mình).
function segmentKey([x1, y1, x2, y2]: Connector): string {
  return `${x1},${y1},${x2},${y2}`
}

function buildSpouseConnectors(
  relationships: Relationship[],
  positioned: PositionedPerson[],
): SpouseConnector[] {
  const posById = new Map(positioned.map((p) => [p.id, p]))
  const out: SpouseConnector[] = []
  for (const r of relationships) {
    if (r.type !== 'spouse_of') continue
    const a = posById.get(r.from_id)
    const b = posById.get(r.to_id)
    if (!a || !b || a.top !== b.top) continue // không cùng hàng: không phải là cặp được lib xếp cạnh nhau
    const y = a.top + 1
    const ax = a.left + 1
    const bx = b.left + 1
    const [x1, x2] = ax <= bx ? [ax, bx] : [bx, ax]
    out.push({ x1, y1: y, x2, y2: y, dashed: r.status !== 'married' })
  }
  return out
}

export function buildTreeLayout(people: Person[], relationships: Relationship[]): TreeLayout {
  if (people.length === 0)
    return { nodes: [], connectors: [], spouseConnectors: [], canvas: { width: 0, height: 0 }, primaryRootId: null }

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
    const rootId = pickRoot(compIds, graph, personById)
    if (primaryRootId === null) primaryRootId = rootId

    // `pickRoot` đã ưu tiên chọn gốc không phải nữ, nhưng ca mẹ đơn thân (không
    // có ứng viên nam nào trong thành phần) vẫn phải nhận gốc nữ. Vẫn ép gender
    // CỦA RIÊNG NODE ROOT thành 'male' ở đây — chỉ cho input layout (như
    // toLibGender), không đụng gender thật hiển thị ở UI — để mọi cặp vợ/chồng
    // TRONG CÂY (không riêng gốc, xem giải thích ở pickRoot) vẫn theo đúng quy
    // ước "chồng bên trái" thay vì lật ngược vì gốc tình cờ là nữ.
    const compNodesForLayout = compNodes.map((n) =>
      n.id === rootId ? { ...n, gender: castGender('male') } : n,
    )

    const result = calcTree(compNodesForLayout, { rootId })
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

  // Đoạn nối vợ/chồng: bỏ khỏi connector chung (tọa độ trùng khớp — xem giải
  // thích ở buildSpouseConnectors), thay bằng bản có ngữ nghĩa status riêng.
  const spouseConnectors = buildSpouseConnectors(relationships, nodes)
  const spouseSegments = new Set(
    spouseConnectors.map((s) => segmentKey([s.x1, s.y1, s.x2, s.y2])),
  )
  const plainConnectors = connectors.filter((c) => !spouseSegments.has(segmentKey(c)))

  return {
    nodes,
    connectors: plainConnectors,
    spouseConnectors,
    canvas: {
      width: Math.max(offsetX - COMPONENT_GAP_UNITS, 0),
      height: maxHeight,
    },
    primaryRootId,
  }
}
