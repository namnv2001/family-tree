import type { Person } from '../lib/people'
import { formatLifespan } from '../lib/people'
import { Avatar } from './Avatar'

// Kích thước Ô LƯỚI cây (px) — TreeView dùng để suy ra tỉ lệ px/đơn vị lưới
// của relatives-tree (mỗi node chiếm đúng 2 đơn vị mỗi chiều, xem constants.ts
// của lib: SIZE = 2), và là khổ CỐ ĐỊNH của thẻ (width/height ở wrapper trong
// TreeView) — tên dài hơn ô thì cắt bớt + "…" (truncate), xem đầy đủ qua
// tooltip. Từng thử để thẻ tự nới rộng theo tên (fit-content) nhưng node
// absolute-position sát nhau theo tọa độ lưới cố định, không tự reflow: ai
// rộng hơn ô của mình sẽ đè lên hàng xóm — bug đã báo, quay lại khổ cố định.
export const NODE_WIDTH = 224
// +24px so với M2 (88) để chừa hàng nút nhanh FR-2.1 bên dưới, không đổi phần thân thẻ.
export const NODE_HEIGHT = 112

// Chừa khoảng hở quanh ô lưới để nét nối (connector, vẽ ở lớp dưới trong
// TreeView) lộ ra giữa các thẻ — không thì thẻ phủ kín hết ô, che mất toàn bộ
// đường nối.
export const CARD_INSET = 6

export function TreeNode({
  person,
  isRootLineage,
  isSelected,
  collapsed,
  hiddenCount,
  onSelect,
  onToggleCollapse,
  onAddParent,
  onAddSpouse,
  onAddChild,
}: {
  person: Person
  // Highlight người thuộc dòng họ gốc (chính gốc + hậu duệ huyết thống) —
  // phân biệt với vợ/chồng kết hôn vào (không tô). Tính ở TreeView (đọc
  // descendantsOf), TreeNode chỉ lo hiển thị.
  isRootLineage: boolean
  // FR-3.5: đang mở panel chi tiết cho đúng người này — viền xanh riêng, độc
  // lập với viền vàng "dòng họ gốc" (2 tín hiệu khác ý nghĩa, không đụng nhau).
  isSelected: boolean
  // FR-3.3: nhánh dưới người này đang bị thu gọn — chỉ có ý nghĩa khi
  // hiddenCount > 0 (thu gọn một người hết-con, hoặc con vừa bị xóa sau khi
  // đã thu gọn, thì không có gì để hiện badge).
  collapsed: boolean
  hiddenCount: number
  onSelect: () => void
  onToggleCollapse: () => void
  // FR-5.1 AC: người xem qua link chia sẻ "không thấy nút sửa/xóa nào" —
  // optional, không phải boolean `readOnly` riêng: TreeView đơn giản không
  // truyền 3 hàm này ở chế độ chia sẻ, và TypeScript tự narrow đủ-cả-3 hay
  // không trong nhánh render dưới, khỏi cần `!` non-null assertion.
  onAddParent?: () => void
  onAddSpouse?: () => void
  onAddChild?: () => void
}) {
  const deceased = person.is_deceased || !!person.death_date // FR-1.4
  // Màu viền ưu tiên highlight dòng họ gốc; nền vẫn theo còn sống/đã mất như
  // cũ — 2 tín hiệu độc lập, không đụng nhau (người gốc đã mất vẫn nhận biết
  // được cả 2 vừa "đã mất" (nền xám) vừa "dòng họ gốc" (viền vàng)).
  const borderColor = isRootLineage
    ? 'border-amber-400'
    : deceased
      ? 'border-stone-400'
      : 'border-stone-200'

  return (
    // `relative`: neo cho badge thu gọn (absolute) bên dưới — nếu thiếu, badge
    // sẽ neo nhầm vào wrapper lưới cố định của TreeView (cũng absolute), lồi
    // ra ngoài đúng bằng CARD_INSET thay vì đúng sát viền thẻ.
    <div
      id={`tree-node-${person.id}`}
      className={`relative flex h-full w-full flex-col overflow-hidden rounded-lg border text-left shadow-sm ${borderColor} ${
        deceased ? 'bg-stone-50' : 'bg-white'
      } ${isSelected ? 'ring-2 ring-sky-500 ring-offset-1' : ''}`}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-label={`Xem chi tiết ${person.full_name}`}
        className="flex flex-1 items-center gap-3 overflow-hidden px-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-800"
      >
        <Avatar photoPath={person.photo_path} name={person.full_name} grayscale={deceased} size={48} />
        {/* min-w-0: mặc định flex item không co nhỏ hơn nội dung của nó (kể cả
            khi có truncate) — thiếu dòng này thì `truncate` bên dưới vô tác
            dụng, tên dài vẫn đẩy card rộng ra đè card kế bên (đúng bug đã báo:
            card của "tree-node" khác absolute-position sát nhau theo lưới
            cố định, ai rộng hơn ô của mình thì đè lên hàng xóm, không tự
            reflow). Card giờ CỐ ĐỊNH đúng khổ ô lưới (xem TreeView), tên dài
            hơn cắt bớt + "…", xem đầy đủ bằng tooltip (title) khi hover. */}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-stone-800" title={person.full_name}>
            {person.full_name}
          </p>
          <p className="truncate text-xs text-stone-500">{formatLifespan(person)}</p>
        </div>
      </button>
      {/* FR-2.1: nút nhanh thêm quan hệ ngay trên node, không cần mở panel
          riêng. Ẩn hẳn ở chế độ chia sẻ (onAddParent thiếu → cả 3 cũng thiếu,
          TreeView luôn truyền theo cặp đủ-hoặc-không) — nút phần trên (avatar
          + tên) tự giãn full-height lấp khoảng trống, không để hàng trống lộ ra. */}
      {onAddParent && onAddSpouse && onAddChild && (
        <div className="flex divide-x divide-stone-200 border-t border-stone-200 text-[10px] text-stone-500">
          <QuickButton label="Cha/Mẹ" title="Thêm cha/mẹ" onClick={onAddParent} />
          <QuickButton label="Vợ/Chồng" title="Thêm vợ/chồng" onClick={onAddSpouse} />
          <QuickButton label="Con" title="Thêm con" onClick={onAddChild} />
        </div>
      )}
      {/* FR-3.3 AC: nhánh thu gọn hiện badge số người đang ẩn. Bấm để mở lại
          ngay tại đây — không bắt phải mở panel chi tiết mới mở được (đó là
          nơi BẮT ĐẦU thu gọn, xem PersonPanel — vì mở-lại thì hợp không cần
          mở panel, còn thu gọn thì bấm nhầm quá dễ nếu để nút lù lù trên
          canvas ngay cạnh 3 nút nhanh). Chắc chắn không có hàng con nào ngay
          dưới lúc này (đã bị loại khỏi input layout ở TreeView) nên badge lồi
          nửa dưới viền không đè lên node nào khác. */}
      {collapsed && hiddenCount > 0 && (
        <button
          type="button"
          onClick={onToggleCollapse}
          title={`Mở rộng nhánh — đang ẩn ${hiddenCount} người`}
          // aria-label riêng: nút có text "+3" làm accessible name mặc định,
          // không đủ nghĩa cho screen reader (title không tính vào accessible
          // name khi đã có text con) — ghi đè bằng câu đầy đủ như tooltip.
          aria-label={`Mở rộng nhánh — đang ẩn ${hiddenCount} người`}
          className="absolute -bottom-2 left-1/2 z-10 -translate-x-1/2 translate-y-1/2 rounded-full border border-amber-400 bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium leading-none text-amber-700 shadow-sm hover:bg-amber-200"
        >
          +{hiddenCount}
        </button>
      )}
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
