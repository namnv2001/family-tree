import type { Person } from './people'
import type { Relationship } from './relationships'

export type TreeData = { name: string; people: Person[]; relationships: Relationship[] }

// Chỉ `npm run dev` mới sửa được: endpoint ghi file (/__save, vite.config.ts) chỉ
// tồn tại trên dev server. Bản build lên GitHub Pages là tĩnh, chỉ xem.
export const editable = import.meta.env.DEV

let loaded: Promise<TreeData> | null = null

export function loadTree(): Promise<TreeData> {
  loaded ??= fetch(`${import.meta.env.BASE_URL}tree.json`, { cache: 'no-cache' }).then((res) => {
    if (!res.ok) throw new Error(`Không tải được tree.json (HTTP ${res.status}).`)
    return res.json() as Promise<TreeData>
  })
  return loaded
}

export async function saveFile(path: string, body: BodyInit | null, method: 'POST' | 'DELETE' = 'POST') {
  const res = await fetch(`/__save/${path}`, { method, body })
  if (!res.ok) throw new Error(`Lưu thất bại (HTTP ${res.status}).`)
}

let writing: Promise<void> = Promise.resolve()

// Ghi tuần tự: mỗi lần ghi gửi NGUYÊN file tại thời điểm đó, nên chỉ cần thứ tự
// đúng là lần ghi cuối luôn mang bản mới nhất.
export async function mutate(change: (data: TreeData) => void): Promise<void> {
  const data = await loadTree()
  change(data)
  const body = JSON.stringify(data, null, 2) + '\n'
  writing = writing.catch(() => {}).then(() => saveFile('tree.json', body))
  return writing
}
