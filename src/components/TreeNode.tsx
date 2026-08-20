import type { Person } from '../lib/people'
import { formatLifespan } from '../lib/people'
import { Avatar } from './Avatar'

// Kích thước Ô LƯỚI cây (px) — TreeView dùng để suy ra tỉ lệ px/đơn vị lưới
// của relatives-tree (mỗi node chiếm đúng 2 đơn vị mỗi chiều, xem constants.ts
// của lib: SIZE = 2) và làm sàn khổ tối thiểu cho thẻ (min-width ở wrapper
// trong TreeView) — thẻ tên dài hơn ô thì tự nới rộng ra (width: fit-content),
// không truncate.
export const NODE_WIDTH = 224
export const NODE_HEIGHT = 88

// Chừa khoảng hở quanh ô lưới để nét nối (connector, vẽ ở lớp dưới trong
// TreeView) lộ ra giữa các thẻ — không thì thẻ phủ kín hết ô, che mất toàn bộ
// đường nối.
export const CARD_INSET = 6

export function TreeNode({ person }: { person: Person }) {
  const deceased = person.is_deceased || !!person.death_date // FR-1.4

  return (
    <div
      id={`tree-node-${person.id}`}
      className={`flex h-full w-full items-center gap-3 rounded-lg border px-3 text-left shadow-sm ${
        deceased ? 'border-stone-400 bg-stone-50' : 'border-stone-200 bg-white'
      }`}
    >
      <Avatar
        photoPath={person.photo_path}
        name={person.full_name}
        grayscale={deceased}
        size={48}
      />
      <div>
        <p className="text-sm font-medium text-stone-800">{person.full_name}</p>
        <p className="text-xs text-stone-500">{formatLifespan(person)}</p>
      </div>
    </div>
  )
}
