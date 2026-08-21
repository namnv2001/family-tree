import { useEffect, useMemo, useRef, useState } from 'react'
import {
  TransformComponent,
  TransformWrapper,
  type ReactZoomPanPinchContentRef,
} from 'react-zoom-pan-pinch'
import { listPeople, type Person } from '../lib/people'
import { listRelationships, type Relationship } from '../lib/relationships'
import { buildTreeLayout } from '../lib/treeLayout'
import { RelationshipModal, type RelationshipKind } from './RelationshipModal'
import { CARD_INSET, NODE_HEIGHT, NODE_WIDTH, TreeNode } from './TreeNode'

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

  // FR-3.1: tính toán layout (relatives-tree) chỉ khi dữ liệu đổi, không phải
  // mỗi lần pan/zoom re-render.
  const layout = useMemo(() => {
    if (!people || !relationships) return null
    return buildTreeLayout(people, relationships)
  }, [people, relationships])

  function handleGoRoot() {
    const ref = transformRef.current
    if (!ref || !layout?.primaryRootId) return
    ref.zoomToElement(`tree-node-${layout.primaryRootId}`, 1, 400)
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
      </div>

      {layout.nodes.length === 0 ? (
        <p className="p-4 text-center text-stone-400">
          Chưa có ai trong cây. Thêm người ở tab Danh sách.
        </p>
      ) : (
        <div className="flex-1 overflow-hidden bg-stone-100">
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
                      minWidth: NODE_WIDTH,
                      height: NODE_HEIGHT,
                      padding: CARD_INSET,
                      width: 'fit-content',
                    }}
                  >
                    <TreeNode
                      person={n}
                      onAddParent={() => setModal({ person: n, kind: 'parent' })}
                      onAddSpouse={() => setModal({ person: n, kind: 'spouse' })}
                      onAddChild={() => setModal({ person: n, kind: 'child' })}
                    />
                  </div>
                ))}
              </div>
            </TransformComponent>
          </TransformWrapper>
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
