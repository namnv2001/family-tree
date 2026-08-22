import type { Person } from './people'
import type { Relationship } from './relationships'
import { supabase } from './supabase'

export type SharedTree = {
  tree: { id: string; name: string }
  people: Person[]
  relationships: Relationship[]
}

// FR-5.1: đọc cây qua link chia sẻ — CHỈ qua RPC này (SECURITY DEFINER, xem
// migration 0004_share_link.sql). Không có RLS policy nào mở cho anon trên
// trees/people/relationships, và hàm chỉ SELECT — nên dù có token trong tay
// cũng không có đường nào để ghi (AC "API cũng chặn, không chỉ ẩn UI").
// null = token sai hoặc chủ cây đã tắt chia sẻ.
export async function getSharedTree(token: string): Promise<SharedTree | null> {
  const { data, error } = await supabase.rpc('get_shared_tree', { p_token: token })
  if (error) throw error
  return (data as SharedTree | null) ?? null
}

// Bật chia sẻ / tạo lại link: sinh token bằng Web Crypto (crypto.randomUUID —
// đủ ngẫu nhiên để không đoán được, không cần round-trip gen_random_uuid()
// của Postgres). Ghi qua policy owner-update sẵn có (trees_owner_update,
// migration 0001) — không cần RPC riêng để SET token, chỉ ĐỌC (RPC ở trên)
// mới cần bỏ qua RLS.
export async function enableSharing(treeId: string): Promise<string> {
  const token = crypto.randomUUID()
  const { error } = await supabase.from('trees').update({ share_token: token }).eq('id', treeId)
  if (error) throw error
  return token
}

export async function disableSharing(treeId: string): Promise<void> {
  const { error } = await supabase.from('trees').update({ share_token: null }).eq('id', treeId)
  if (error) throw error
}

export function shareUrl(token: string): string {
  return `${window.location.origin}${window.location.pathname}?share=${token}`
}
