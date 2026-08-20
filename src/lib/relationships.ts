import { supabase } from './supabase'

export type RelationshipType = 'parent_of' | 'spouse_of'
export type SpouseStatus = 'married' | 'divorced' | 'widowed'

export type Relationship = {
  id: string
  tree_id: string
  type: RelationshipType
  from_id: string
  to_id: string
  status: SpouseStatus | null
}

// Đọc thôi — chưa có UI tạo quan hệ (đó là M3). Cần hàm này ở M2 để TreeView
// dựng cây từ dữ liệu thật, dù hiện tại bảng này luôn rỗng.
export async function listRelationships(treeId: string): Promise<Relationship[]> {
  const { data, error } = await supabase
    .from('relationships')
    .select('*')
    .eq('tree_id', treeId)
  if (error) throw error
  return data as Relationship[]
}
