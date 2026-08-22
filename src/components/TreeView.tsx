import { useEffect, useMemo, useRef, useState } from 'react'
import {
  TransformComponent,
  TransformWrapper,
  type ReactZoomPanPinchContentRef,
} from 'react-zoom-pan-pinch'
import { listPeople, type Person } from '../lib/people'
import { collapsedBranchIds, descendantsOf, listRelationships, type Relationship } from '../lib/relationships'
import { buildTreeLayout } from '../lib/treeLayout'
import { PersonPanel } from './PersonPanel'
import { RelationshipModal, type RelationshipKind } from './RelationshipModal'
import { CARD_INSET, NODE_HEIGHT, NODE_WIDTH, TreeNode } from './TreeNode'
import { TreeSearch } from './TreeSearch'

// relatives-tree đặt mỗi node cách nhau đúng 2 đơn vị lưới theo cả 2 chiều
// (SIZE trong constants.ts của lib) — nên 1 đơn vị lưới = nửa kích thước node.
const UNIT_X = NODE_WIDTH / 2
const UNIT_Y = NODE_HEIGHT / 2

export function TreeView({ treeId }: { treeId: string }) {
  const [people, setPeople] = useState<Person[] | null>(null)
  const [relationships, setRelationships] = useState<Relationship[] | null>(
    null,
  )
  const [error, setError] = useState<string | null>(null)
  const [modal, setModal] = useState<{ person: Person; kind: RelationshipKind } | null>(null)
  // FR-3.5: người đang mở panel chi tiết — giữ ID, không giữ bản Person sao
  // chép, để luôn đọc đúng dữ liệu mới nhất từ `people` mỗi lần render (không
  // cần đồng bộ tay khi people đổi).
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null)
  // FR-3.3: tập người đang bị thu gọn nhánh — chỉ là view-state (không lưu
  // DB, không phải yêu cầu của FR-3.3), mất khi rời tab/tải lại trang.
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set())
  // Người cần pan/zoom tới ngay khi node của họ xuất hiện trong DOM — tách
  // riêng khỏi các state trên vì có handler cần MỞ LẠI một nhánh đã thu gọn
  // trước khi node đích tồn tại trong DOM (xem effect dưới + `focusPerson`).
  const [focusTarget, setFocusTarget] = useState<string | null>(null)
  const transformRef = useRef<ReactZoomPanPinchContentRef>(null)

  useEffect(() => {
    Promise.all([listPeople(treeId), listRelationships(treeId)])
      .then(([p, r]) => {
        setPeople(p)
        setRelationships(r)
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : 'Không tải được cây.'),
      )
  }, [treeId])

  // FR-3.3: nhánh thu gọn → loại hẳn người bị ẩn khỏi ĐẦU VÀO trước khi tính
  // layout, để buildTreeLayout không cần biết gì về "thu gọn" — tái dùng đúng
  // cơ chế tách thành phần liên thông đã có sẵn (người bị ẩn coi như không
  // tồn tại, giống cách app đã xử lý dữ liệu mồ côi ở buildGraph). Badge số
  // người ẩn (AC FR-3.3) tính kèm luôn ở đây, theo đúng cùng một hàm.
  const { visiblePeople, visibleRelationships, hiddenCountByNode } = useMemo(() => {
    if (!people || !relationships || collapsedIds.size === 0)
      return {
        visiblePeople: people,
        visibleRelationships: relationships,
        hiddenCountByNode: new Map<string, number>(),
      }
    const hiddenCountByNode = new Map<string, number>()
    const hiddenIds = new Set<string>()
    for (const id of collapsedIds) {
      const hidden = collapsedBranchIds(id, people, relationships)
      hiddenCountByNode.set(id, hidden.size)
      for (const h of hidden) hiddenIds.add(h)
    }
    return {
      visiblePeople: people.filter((p) => !hiddenIds.has(p.id)),
      visibleRelationships: relationships.filter((r) => !hiddenIds.has(r.from_id) && !hiddenIds.has(r.to_id)),
      hiddenCountByNode,
    }
  }, [people, relationships, collapsedIds])

  // FR-3.1: tính toán layout (relatives-tree) chỉ khi dữ liệu/thu gọn đổi,
  // không phải mỗi lần pan/zoom re-render.
  const layout = useMemo(() => {
    if (!visiblePeople || !visibleRelationships) return null
    return buildTreeLayout(visiblePeople, visibleRelationships)
  }, [visiblePeople, visibleRelationships])

  // Ai đang có con (theo dữ liệu ĐẦY ĐỦ, không phải bản đã lọc thu gọn) — để
  // quyết định panel có hiện nút "Thu gọn nhánh" hay không. Dùng relationships
  // gốc vì một người bị thu gọn vẫn phải giữ được nút bấm để mở lại.
  const idsWithChildren = useMemo(() => {
    if (!relationships) return new Set<string>()
    return new Set(relationships.filter((r) => r.type === 'parent_of').map((r) => r.from_id))
  }, [relationships])

  // Highlight: dòng họ gốc = chính người gốc (primaryRootId) + mọi hậu duệ
  // huyết thống của họ (parent_of, đệ quy) — KHÔNG tính vợ/chồng, vì họ là
  // người kết hôn vào, không cùng huyết thống với dòng họ gốc. Dùng lại
  // `descendantsOf` sẵn có (đang phục vụ RelationshipModal lọc vòng lặp).
  // Đọc `relationships` ĐẦY ĐỦ (không phải bản lọc thu gọn) — dòng họ ai
  // thuộc về không đổi vì một nhánh đang bị ẩn tạm trên màn hình.
  const rootLineage = useMemo(() => {
    if (!layout?.primaryRootId || !relationships) return null
    return new Set([layout.primaryRootId, ...descendantsOf(layout.primaryRootId, relationships)])
  }, [layout?.primaryRootId, relationships])

  const selectedPerson = people?.find((p) => p.id === selectedPersonId) ?? null

  // FR-3.5/FR-4.1: "nhảy tới" một người có thể đang bị ẩn trong nhánh đã thu
  // gọn (của chính họ hoặc một tổ tiên bất kỳ) — tự mở lại nhánh đang che
  // trước, để hành động "nhảy tới" không bao giờ thất bại âm thầm.
  function ensureVisible(personId: string) {
    if (!people || !relationships) return
    setCollapsedIds((prev) => {
      if (prev.size === 0) return prev
      let changed = false
      const next = new Set(prev)
      for (const id of prev) {
        if (collapsedBranchIds(id, people, relationships).has(personId)) {
          next.delete(id)
          changed = true
        }
      }
      return changed ? next : prev
    })
  }

  // Không gọi zoomToElement ngay trong handler: DOM lúc đó vẫn còn tọa độ CŨ
  // (React gộp state update, chưa commit lại trong cùng lần gọi) — đặc biệt
  // khi ensureVisible vừa mở lại một nhánh, node đích còn CHƯA TỒN TẠI trong
  // DOM. Effect chạy SAU khi commit nên luôn thấy đúng, kể cả phải chờ thêm
  // một vòng render (mở nhánh trước, có layout mới, rồi mới thấy node).
  useEffect(() => {
    if (!focusTarget) return
    const ref = transformRef.current
    if (ref && document.getElementById(`tree-node-${focusTarget}`)) {
      ref.zoomToElement(`tree-node-${focusTarget}`, 1, 400)
      setFocusTarget(null)
    }
  }, [focusTarget, layout])

  function focusPerson(personId: string) {
    ensureVisible(personId)
    setFocusTarget(personId)
  }

  // Dùng chung cho: click node (đã ở PersonPanel/TreeNode), chọn kết quả tìm
  // kiếm (FR-4.1), click người liên quan trong panel (FR-3.5 "nhảy tới").
  function handleJumpTo(person: Person) {
    setSelectedPersonId(person.id)
    focusPerson(person.id)
  }

  function toggleCollapse(id: string) {
    setCollapsedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleGoRoot() {
    if (layout?.primaryRootId) focusPerson(layout.primaryRootId)
  }

  function handleFit() {
    const ref = transformRef.current
    const wrapper = ref?.instance.wrapperComponent
    const content = ref?.instance.contentComponent
    if (!ref || !wrapper || !content) return
    // "Fit toàn cây" (FR-3.2): scale nhỏ nhất giữa 2 chiều để toàn bộ nội dung
    // vừa khung nhìn, không zoom to hơn 100% với cây chỉ có vài người.
    const scale = Math.min(
      wrapper.clientWidth / content.offsetWidth,
      wrapper.clientHeight / content.offsetHeight,
      1,
    )
    ref.centerView(scale, 200)
  }

  if (error) return <p className="p-4 text-red-600">{error}</p>
  if (!layout) return <p className="p-4 text-stone-400">Đang tải…</p>

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b border-stone-200 px-4 py-2">
        <button
          onClick={handleGoRoot}
          disabled={!layout.primaryRootId}
          className="rounded-md border border-stone-300 px-3 py-1.5 text-sm hover:bg-stone-50 disabled:opacity-50"
        >
          Về gốc
        </button>
        <button
          onClick={handleFit}
          disabled={layout.nodes.length === 0}
          className="rounded-md border border-stone-300 px-3 py-1.5 text-sm hover:bg-stone-50 disabled:opacity-50"
        >
          Fit toàn cây
        </button>
        <div className="ml-auto">
          <TreeSearch people={people ?? []} onSelect={handleJumpTo} />
        </div>
      </div>

      {layout.nodes.length === 0 ? (
        <p className="p-4 text-center text-stone-400">
          Chưa có ai trong cây. Thêm người ở tab Danh sách.
        </p>
      ) : (
        <div className="relative flex-1 overflow-hidden bg-stone-100">
          <TransformWrapper
            ref={transformRef}
            minScale={0.15}
            maxScale={2}
            limitToBounds={false}
            centerOnInit
            // Mặc định `smooth: true` của lib nhân bước zoom với deltaY THÔ của
            // sự kiện lăn chuột — chuột thường trên Windows bắn deltaY ~100/nấc,
            // bước zoom thành 0.015*100=1.5 (lớn hơn cả khoảng minScale-maxScale),
            // mỗi cú lăn nhảy thẳng lên/xuống 2 đầu mút, cảm giác giật cục. Tắt
            // `smooth` để bước zoom cố định theo `wheel.step`, không phụ thuộc
            // deltaY của từng loại chuột/trackpad.
            smooth={false}
            wheel={{ step: 0.15 }}
          >
            <TransformComponent
              wrapperStyle={{ width: '100%', height: '100%' }}
            >
              <div
                className="relative"
                style={{
                  width: layout.canvas.width * UNIT_X,
                  height: layout.canvas.height * UNIT_Y,
                }}
              >
                {/* Nét nối vẽ trước, dưới node — phần đi qua khoảng hở giữa các
                    node thì lộ ra, phần đi qua thân node thì bị node che, đúng
                    kiểu sơ đồ cây chuẩn. */}
                <svg
                  className="absolute inset-0"
                  width={layout.canvas.width * UNIT_X}
                  height={layout.canvas.height * UNIT_Y}
                >
                  {layout.connectors.map(([x1, y1, x2, y2], i) => (
                    <line
                      key={i}
                      x1={x1 * UNIT_X}
                      y1={y1 * UNIT_Y}
                      x2={x2 * UNIT_X}
                      y2={y2 * UNIT_Y}
                      stroke="#a8a29e"
                      strokeWidth={2}
                    />
                  ))}
                  {/* FR-2.3: vợ/chồng đã ly hôn hoặc đã mất → nét đứt; đang kết hôn → nét liền. */}
                  {layout.spouseConnectors.map((s, i) => (
                    <line
                      key={`spouse-${i}`}
                      x1={s.x1 * UNIT_X}
                      y1={s.y1 * UNIT_Y}
                      x2={s.x2 * UNIT_X}
                      y2={s.y2 * UNIT_Y}
                      stroke="#78716c"
                      strokeWidth={2}
                      strokeDasharray={s.dashed ? '6 4' : undefined}
                    />
                  ))}
                </svg>
                {layout.nodes.map((n) => (
                  <div
                    key={n.id}
                    className="absolute flex items-center justify-center"
                    style={{
                      left: n.left * UNIT_X,
                      top: n.top * UNIT_Y,
                      // Cố định đúng khổ ô lưới — không fit-content nữa. Node
                      // absolute-position sát nhau theo tọa độ lưới cố định,
                      // không tự reflow: ai rộng hơn ô của mình sẽ đè lên hàng
                      // xóm bên cạnh (bug đã báo với tên dài). TreeNode tự cắt
                      // bớt tên quá dài (truncate + tooltip) để luôn vừa khổ.
                      width: NODE_WIDTH,
                      height: NODE_HEIGHT,
                      padding: CARD_INSET,
                    }}
                  >
                    <TreeNode
                      person={n}
                      isRootLineage={rootLineage?.has(n.id) ?? false}
                      isSelected={selectedPersonId === n.id}
                      collapsed={collapsedIds.has(n.id)}
                      hiddenCount={hiddenCountByNode.get(n.id) ?? 0}
                      onSelect={() => setSelectedPersonId(n.id)}
                      onToggleCollapse={() => toggleCollapse(n.id)}
                      onAddParent={() => setModal({ person: n, kind: 'parent' })}
                      onAddSpouse={() => setModal({ person: n, kind: 'spouse' })}
                      onAddChild={() => setModal({ person: n, kind: 'child' })}
                    />
                  </div>
                ))}
              </div>
            </TransformComponent>
          </TransformWrapper>

          {selectedPerson && people && relationships && (
            <PersonPanel
              person={selectedPerson}
              people={people}
              relationships={relationships}
              collapsed={collapsedIds.has(selectedPerson.id)}
              hiddenCount={hiddenCountByNode.get(selectedPerson.id) ?? 0}
              canCollapse={idsWithChildren.has(selectedPerson.id)}
              onClose={() => setSelectedPersonId(null)}
              onJumpTo={handleJumpTo}
              onToggleCollapse={() => toggleCollapse(selectedPerson.id)}
              onFocus={() => focusPerson(selectedPerson.id)}
            />
          )}
        </div>
      )}

      {modal && people && relationships && (
        <RelationshipModal
          treeId={treeId}
          person={modal.person}
          kind={modal.kind}
          people={people}
          relationships={relationships}
          onClose={() => setModal(null)}
          onPersonCreated={(p) => setPeople((prev) => [...(prev ?? []), p])}
          onRelationshipCreated={(r) => setRelationships((prev) => [...(prev ?? []), r])}
          onRelationshipChanged={(r) =>
            setRelationships((prev) => prev?.map((x) => (x.id === r.id ? r : x)) ?? prev)
          }
          onRelationshipDeleted={(id) =>
            setRelationships((prev) => prev?.filter((r) => r.id !== id) ?? prev)
          }
        />
      )}
    </div>
  )
}
