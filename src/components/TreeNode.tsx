import type { Person } from '../lib/people'
import { formatLifespan } from '../lib/people'
import { Avatar } from './Avatar'

// Kích thước Ô LƯỚI cây (px) — TreeView dùng để suy ra tỉ lệ px/đơn vị lưới
// của relatives-tree (mỗi node chiếm đúng 2 đơn vị mỗi chiều, xem constants.ts
// của lib: SIZE = 2) và làm sàn khổ tối thiểu cho thẻ (min-width ở wrapper
// trong TreeView) — thẻ tên dài hơn ô thì tự nới rộng ra (width: fit-content),
// không truncate.
export const NODE_WIDTH = 224
// +24px so với M2 (88) để chừa hàng nút nhanh FR-2.1 bên dưới, không đổi phần thân thẻ.
export const NODE_HEIGHT = 112

// Chừa khoảng hở quanh ô lưới để nét nối (connector, vẽ ở lớp dưới trong
// TreeView) lộ ra giữa các thẻ — không thì thẻ phủ kín hết ô, che mất toàn bộ
// đường nối.
export const CARD_INSET = 6

export function TreeNode({
  person,
  onAddParent,
  onAddSpouse,
  onAddChild,
}: {
  person: Person
  onAddParent: () => void
  onAddSpouse: () => void
  onAddChild: () => void
}) {
  const deceased = person.is_deceased || !!person.death_date // FR-1.4

  return (
    <div
      id={`tree-node-${person.id}`}
      className={`flex h-full w-full flex-col overflow-hidden rounded-lg border text-left shadow-sm ${
        deceased ? 'border-stone-400 bg-stone-50' : 'border-stone-200 bg-white'
      }`}
    >
      <div className="flex flex-1 items-center gap-3 px-3">
        <Avatar photoPath={person.photo_path} name={person.full_name} grayscale={deceased} size={48} />
        <div>
          <p className="text-sm font-medium text-stone-800">{person.full_name}</p>
          <p className="text-xs text-stone-500">{formatLifespan(person)}</p>
        </div>
      </div>
      {/* FR-2.1: nút nhanh thêm quan hệ ngay trên node, không cần mở panel riêng. */}
      <div className="flex divide-x divide-stone-200 border-t border-stone-200 text-[10px] text-stone-500">
        <QuickButton label="Cha/Mẹ" title="Thêm cha/mẹ" onClick={onAddParent} />
        <QuickButton label="Vợ/Chồng" title="Thêm vợ/chồng" onClick={onAddSpouse} />
        <QuickButton label="Con" title="Thêm con" onClick={onAddChild} />
      </div>
    </div>
  )
}

function QuickButton({ label, title, onClick }: { label: string; title: string; onClick: () => void }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="flex-1 truncate px-1 py-1 hover:bg-stone-50 hover:text-stone-800"
    >
      + {label}
    </button>
  )
}
