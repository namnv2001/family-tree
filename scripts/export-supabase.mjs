// Chuyển dữ liệu cũ từ Supabase sang public/tree.json + public/photos (chạy 1 lần).
// Cần bật chia sẻ trên app cũ để có token: node --env-file=.env.local scripts/export-supabase.mjs <share_token>
import { mkdir, writeFile } from 'node:fs/promises'

const url = process.env.VITE_SUPABASE_URL
const key = process.env.VITE_SUPABASE_ANON_KEY
const token = process.argv[2]
if (!url || !key || !token) throw new Error('Thiếu VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY hoặc share token.')

const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }
const post = async (path, body) => {
  const res = await fetch(`${url}${path}`, { method: 'POST', headers, body: JSON.stringify(body) })
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status} ${await res.text()}`)
  return res.json()
}

const shared = await post('/rest/v1/rpc/get_shared_tree', { p_token: token })
if (!shared) throw new Error('Token sai hoặc đã tắt chia sẻ.')

await mkdir('public/photos', { recursive: true })
const people = []
for (const { tree_id: _, ...p } of shared.people) {
  if (p.photo_path) {
    const { signedURL } = await post(`/storage/v1/object/sign/photos/${p.photo_path}`, { expiresIn: 60 })
    const img = await fetch(`${url}/storage/v1${signedURL}`)
    if (!img.ok) throw new Error(`Ảnh ${p.photo_path}: HTTP ${img.status}`)
    p.photo_path = `photos/${p.id}.webp`
    await writeFile(`public/${p.photo_path}`, Buffer.from(await img.arrayBuffer()))
  }
  people.push(p)
}
const relationships = shared.relationships.map(({ tree_id: _, ...r }) => r)

const tree = { name: shared.tree.name, people, relationships }
await writeFile('public/tree.json', JSON.stringify(tree, null, 2) + '\n')
console.log(`Đã xuất ${people.length} người, ${relationships.length} quan hệ.`)
