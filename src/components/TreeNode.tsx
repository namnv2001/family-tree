import type { Person } from '../lib/people'
import { formatLifespan } from '../lib/people'
import { Avatar } from './Avatar'

// Kích thước 1 node trên lưới cây (px) — TreeView dùng để suy ra tỉ lệ px/đơn
// vị lưới của relatives-tree (mỗi node chiếm đúng 2 đơn vị mỗi chiều, xem
// constants.ts của lib: SIZE = 2).
export const NODE_WIDTH = 168
export const NODE_HEIGHT = 152

export function TreeNode({ person }: { person: Person }) {
  const deceased = person.is_deceased || !!person.death_date // FR-1.4

  return (
    <div
      id={`tree-node-${person.id}`}
      className={`flex h-full flex-col items-center justify-center gap-1 overflow-hidden rounded-lg border px-2 py-2 text-center shadow-sm ${
        deceased ? 'border-stone-400 bg-stone-50' : 'border-stone-200 bg-white'
      }`}
    >
      <Avatar photoPath={person.photo_path} name={person.full_name} grayscale={deceased} size={40} />
      <p className="w-full truncate text-sm font-medium text-stone-800">{person.full_name}</p>
      <p className="text-xs text-stone-500">{formatLifespan(person)}</p>
    </div>
  )
}
