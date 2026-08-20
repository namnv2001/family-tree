// Spike (plan.md mục 5, rủi ro #1): trước khi viết UI cây (M2), kiểm xem
// `relatives-tree` có xếp đúng ca khó nhất của app không — "1 người 3 vợ,
// mỗi cặp chia con riêng, không đè node lên nhau" (FR-3.1 AC).
//
// Không dùng framework test (project chưa có, và plan §6 chỉ bắt buộc test
// cho trigger DB + RLS) — script này tự assert bằng process.exit(1) khi fail,
// dùng được như check.sh (supabase/check.sh) cùng kiểu.
//
// Chạy: không thể `node` trực tiếp vì package build ra ESM không kèm đuôi file
// (import './store' — Node ESM bắt buộc phải có đuôi). Bundle bằng rolldown
// (đã có sẵn trong node_modules qua Vite 8) rồi chạy bằng node:
//
//   npx rolldown scripts/spike-relatives-tree.mjs -o /tmp/spike.cjs -f cjs -p node
//   node /tmp/spike.cjs

import calcTree from 'relatives-tree'

const F = 'male'
const M = 'female'
const blood = (id) => ({ id, type: 'blood' })
const half = (id) => ({ id, type: 'half' })

// P: 1 người, 3 vợ (W1 đang kết hôn, W2 & W3 đã ly hôn), tổng 8 con chia 3+3+2
// — đúng số trong AC "1 người 3 vợ, 8 con" (requirements.md FR-3.1).
const w1kids = ['C1a', 'C1b', 'C1c']
const w2kids = ['C2a', 'C2b', 'C2c']
const w3kids = ['C3a', 'C3b']
const allKids = [...w1kids, ...w2kids, ...w3kids]

function kidNode(id, motherId, siblings) {
  return {
    id,
    gender: id.endsWith('a') ? F : M,
    parents: [blood('P'), blood(motherId)],
    siblings,
    spouses: [],
    children: [],
  }
}

const nodes = [
  {
    id: 'P',
    gender: F,
    parents: [],
    siblings: [],
    spouses: [
      { id: 'W1', type: 'married' },
      { id: 'W2', type: 'divorced' },
      { id: 'W3', type: 'divorced' },
    ],
    children: allKids.map(blood),
  },
  { id: 'W1', gender: M, parents: [], siblings: [], spouses: [{ id: 'P', type: 'married' }], children: w1kids.map(blood) },
  { id: 'W2', gender: M, parents: [], siblings: [], spouses: [{ id: 'P', type: 'divorced' }], children: w2kids.map(blood) },
  { id: 'W3', gender: M, parents: [], siblings: [], spouses: [{ id: 'P', type: 'divorced' }], children: w3kids.map(blood) },
  ...w1kids.map((id) =>
    kidNode(id, 'W1', [...w1kids.filter((s) => s !== id).map(blood), ...w2kids.map(half), ...w3kids.map(half)]),
  ),
  ...w2kids.map((id) =>
    kidNode(id, 'W2', [...w2kids.filter((s) => s !== id).map(blood), ...w1kids.map(half), ...w3kids.map(half)]),
  ),
  ...w3kids.map((id) =>
    kidNode(id, 'W3', [...w3kids.filter((s) => s !== id).map(blood), ...w1kids.map(half), ...w2kids.map(half)]),
  ),
]

let failed = false
function check(label, ok) {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}`)
  if (!ok) failed = true
}

const result = calcTree(nodes, { rootId: 'P' })
const { nodes: placed, canvas } = result

check('calcTree không throw, trả về đủ node', placed.length === nodes.length)

// 1. Không 2 node thật nào trùng ô (left, top) — đè node lên nhau (FR-3.1 AC).
const seen = new Map()
let overlap = null
for (const n of placed) {
  const key = `${n.left},${n.top}`
  if (seen.has(key)) overlap = [seen.get(key), n.id]
  seen.set(key, n.id)
}
check('không có 2 node trùng vị trí (left,top)', !overlap)
if (overlap) console.log('  → trùng ô:', overlap)

// 2. P và cả 3 vợ cùng một hàng (cùng đời) — vợ/chồng phải nằm ngang nhau.
const byId = new Map(placed.map((n) => [n.id, n]))
const pRow = byId.get('P').top
check(
  '3 vợ cùng hàng với P',
  ['W1', 'W2', 'W3'].every((id) => byId.get(id).top === pRow),
)

// 3. Cả 8 con nằm đúng 1 hàng dưới P (không lẫn lên hàng ông bà / lệch hàng).
const childRow = byId.get('C1a').top
check('8 con cùng một hàng, đúng 1 đời dưới P/vợ', allKids.every((id) => byId.get(id).top === childRow))
check('hàng con nằm dưới hàng P (top lớn hơn)', childRow > pRow)

// 4. Mỗi nhóm con (theo từng vợ) đứng liền nhau (left liên tục), không xen
//    lẫn với nhóm con của vợ khác — đúng AC "mỗi cặp là một nhóm gia đình riêng".
// Dùng rank (thứ tự) trong hàng, không dùng giá trị `left` tuyệt đối — lib xếp
// mỗi node cách nhau `SIZE` đơn vị (constants.ts), không phải 1.
const childRowSortedIds = allKids.slice().sort((a, b) => byId.get(a).left - byId.get(b).left)
function isContiguous(ids) {
  const ranks = ids.map((id) => childRowSortedIds.indexOf(id)).sort((a, b) => a - b)
  return ranks.every((r, i) => i === 0 || r === ranks[i - 1] + 1)
}
check('nhóm con của W1 (3 người) liền nhau, không xen nhóm khác', isContiguous(w1kids))
check('nhóm con của W2 (3 người) liền nhau, không xen nhóm khác', isContiguous(w2kids))
check('nhóm con của W3 (2 người) liền nhau, không xen nhóm khác', isContiguous(w3kids))

function groupSpan(ids) {
  const lefts = ids.map((id) => byId.get(id).left)
  return [Math.min(...lefts), Math.max(...lefts)]
}
function disjoint([aMin, aMax], [bMin, bMax]) {
  return aMax < bMin || bMax < aMin
}
const spans = [groupSpan(w1kids), groupSpan(w2kids), groupSpan(w3kids)]
check(
  '3 nhóm con không giao nhau (span rời rạc)',
  disjoint(spans[0], spans[1]) && disjoint(spans[1], spans[2]) && disjoint(spans[0], spans[2]),
)

check('canvas có kích thước hữu hạn, không rỗng', canvas.width > 0 && canvas.height > 0)

console.log('\ncanvas:', canvas)
console.log('\nToàn bộ node (sort theo top, left):')
for (const n of [...placed].sort((a, b) => a.top - b.top || a.left - b.left)) {
  console.log(`  top=${n.top} left=${n.left}  ${n.id}`)
}

if (failed) {
  console.log('\n❌ SPIKE FAIL — relatives-tree KHÔNG xử lý đúng ca đích, xem phương án B (family-chart).')
  process.exit(1)
} else {
  console.log('\n✅ SPIKE PASS — relatives-tree xếp đúng ca "1 người 3 vợ, 8 con chia 3 nhóm". Go cho M2.')
}
