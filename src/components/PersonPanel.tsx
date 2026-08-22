import type { Gender, Person } from '../lib/people'
import { formatLifespan } from '../lib/people'
import { childrenOf, parentsOf, spousesOf, type RelatedPerson } from '../lib/relationships'
import type { Relationship } from '../lib/relationships'
import { Avatar } from './Avatar'

const GENDER_LABEL: Record<Gender, string> = { male: 'Nam', female: 'Nữ', other: 'Khác' }

// FR-3.5: click node → panel bên hông — ảnh, thông tin, danh sách cha mẹ/vợ
// chồng/con (click được để nhảy tới). Cũng là nơi bắt đầu FR-3.3 (thu gọn
// nhánh) và FR-3.4 ("Xem cây từ người này") — cả hai đều là hành động "áp
// lên một người", panel chi tiết là chỗ tự nhiên nhất để đặt nút, không cần
// thêm nút riêng chen chúc trên card giữa canvas.
export function PersonPanel({
  person,
  people,
  relationships,
  collapsed,
  hiddenCount,
  canCollapse,
  onClose,
  onJumpTo,
  onToggleCollapse,
  onFocus,
}: {
  person: Person
  people: Person[]
  relationships: Relationship[]
  collapsed: boolean
  hiddenCount: number
  canCollapse: boolean
  onClose: () => void
  onJumpTo: (person: Person) => void
  onToggleCollapse: () => void
  // FR-3.4: KHÔNG đổi rootId của thuật toán (xem lý do ở treeLayout.ts —
  // relatives-tree chỉ vẽ được đúng MỘT nhánh tổ tiên từ rootId, đổi rootId
  // sang ai không phải gốc thật của cả họ sẽ làm mất hẳn cô/chú/bác + hậu duệ
  // của họ khỏi cây, xác nhận bằng bug thật). Chỉ pan/zoom camera tới người
  // này — cây vẫn hiện đầy đủ, không mất ai; tổ tiên/hậu duệ của họ vốn đã tự
  // nằm trên/dưới vì cây luôn vẽ từ gốc xuống, đúng yêu cầu AC mà không cần
  // đụng gì tới dữ liệu hiển thị.
  onFocus: () => void
}) {
  const deceased = person.is_deceased || !!person.death_date
  const parents = parentsOf(person.id, people, relationships)
  const spouses = spousesOf(person.id, people, relationships)
  const children = childrenOf(person.id, people, relationships)

  return (
    // w-full trên mobile (che hết canvas khi mở, đóng lại bằng nút ✕ — NFR
    // "mobile xem tốt" không yêu cầu panel + cây hiện cùng lúc trên màn hẹp),
    // cố định w-80 từ sm: trở lên.
    <aside className="absolute right-0 top-0 z-30 flex h-full w-full flex-col border-l border-stone-200 bg-white shadow-lg sm:w-80">
      <div className="flex items-center justify-between border-b border-stone-200 px-4 py-3">
        <h2 className="font-semibold text-stone-800">Chi tiết</h2>
        <button onClick={onClose} aria-label="Đóng" className="text-stone-400 hover:text-stone-700">
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="mb-4 flex items-center gap-3">
          <Avatar photoPath={person.photo_path} name={person.full_name} grayscale={deceased} size={56} />
          <div>
            <p className="font-medium text-stone-800">{person.full_name}</p>
            {person.alias && <p className="text-sm text-stone-500">“{person.alias}”</p>}
            <p className="text-sm text-stone-500">
              {[person.gender && GENDER_LABEL[person.gender], formatLifespan(person)].filter(Boolean).join(' · ')}
            </p>
          </div>
        </div>

        {person.note && <p className="mb-4 rounded-md bg-stone-50 p-2 text-sm text-stone-600">{person.note}</p>}

        <RelatedList title="Cha/Mẹ" items={parents} onJumpTo={onJumpTo} />
        <RelatedList title="Vợ/Chồng" items={spouses} onJumpTo={onJumpTo} />
        <RelatedList title="Con" items={children} onJumpTo={onJumpTo} />

        <div className="mt-2 flex flex-col gap-2">
          {canCollapse && (
            <button
              onClick={onToggleCollapse}
              className="w-full rounded-md border border-stone-300 px-3 py-1.5 text-sm hover:bg-stone-50"
            >
              {collapsed ? `Mở rộng nhánh (đang ẩn ${hiddenCount} người)` : 'Thu gọn nhánh dưới người này'}
            </button>
          )}
          <button
            onClick={onFocus}
            className="w-full rounded-md border border-stone-300 px-3 py-1.5 text-sm hover:bg-stone-50"
          >
            Xem cây từ người này
          </button>
        </div>
      </div>
    </aside>
  )
}

function RelatedList({
  title,
  items,
  onJumpTo,
}: {
  title: string
  items: RelatedPerson[]
  onJumpTo: (person: Person) => void
}) {
  if (items.length === 0) return null
  return (
    <div className="mb-4">
      <p className="mb-1 text-xs font-medium tracking-wide text-stone-400 uppercase">{title}</p>
      <ul className="flex flex-col gap-1">
        {items.map(({ rel, person }) => (
          <li key={rel.id}>
            <button
              type="button"
              onClick={() => onJumpTo(person)}
              className="w-full truncate rounded-md border border-stone-200 px-2.5 py-1.5 text-left text-sm hover:bg-stone-50"
            >
              {person.full_name}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
