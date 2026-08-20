import type { Person } from '../lib/people'
import { formatLifespan } from '../lib/people'
import { Avatar } from './Avatar'

// Kích thước Ô LƯỚI cây (px) — TreeView dùng để suy ra tỉ lệ px/đơn vị lưới
// của relatives-tree (mỗi node chiếm đúng 2 đơn vị mỗi chiều, xem constants.ts
// của lib: SIZE = 2) và để đặt khoảng cách tối thiểu giữa các node — KHÔNG
// phải kích thước thẻ thật (thẻ co theo nội dung, xem CARD_MIN_WIDTH).
export const NODE_WIDTH = 224
export const NODE_HEIGHT = 88

// Chừa khoảng hở quanh ô lưới để nét nối (connector, vẽ ở lớp dưới trong
// TreeView) lộ ra giữa các thẻ — không thì thẻ phủ kín hết ô, che mất toàn bộ
// đường nối.
export const CARD_INSET = 6

// Thẻ hình chữ nhật nằm ngang, rộng theo nội dung (width: fit-content) — tên
// ngắn thì thẻ hẹp, không có khoảng trắng thừa; tên dài thì nới ra tối đa
// bằng ô lưới rồi truncate (…), không tự phình to hơn ô làm đè lên thẻ bên
// cạnh. min-width giữ cho thẻ tên rất ngắn (ví dụ "Tí") không bị co dúm lại.
const CARD_MIN_WIDTH = 140

export function TreeNode({ person }: { person: Person }) {
  const deceased = person.is_deceased || !!person.death_date // FR-1.4

  return (
    <div
      id={`tree-node-${person.id}`}
      style={{ minWidth: CARD_MIN_WIDTH, width: 'fit-content', maxWidth: '100%' }}
      className={`flex h-full items-center gap-3 overflow-hidden rounded-lg border px-3 text-left shadow-sm ${
        deceased ? 'border-stone-400 bg-stone-50' : 'border-stone-200 bg-white'
      }`}
    >
      <Avatar photoPath={person.photo_path} name={person.full_name} grayscale={deceased} size={48} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-stone-800">{person.full_name}</p>
        <p className="truncate text-xs text-stone-500">{formatLifespan(person)}</p>
      </div>
    </div>
  )
}
