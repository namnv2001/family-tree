import { supabase } from './supabase'

const BUCKET = 'photos'
const MAX_BYTES = 5 * 1024 * 1024
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const SQUARE_SIZE = 512

// FR-1.3: 1 ảnh/người, tự crop vuông, tối đa 5MB, jpg/png/webp.
function assertValidPhoto(file: File): void {
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error('Chỉ nhận ảnh JPG, PNG hoặc WEBP.')
  }
  if (file.size > MAX_BYTES) {
    throw new Error('Ảnh tối đa 5MB.')
  }
}

// Center-crop về hình vuông trước khi upload — luôn ghi lại thành webp, nên
// đuôi file lưu trong photo_path luôn nhất quán bất kể ảnh gốc là loại gì.
async function cropToSquare(file: File, size = SQUARE_SIZE): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const side = Math.min(bitmap.width, bitmap.height)
  const sx = (bitmap.width - side) / 2
  const sy = (bitmap.height - side) / 2

  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Không tạo được canvas để crop ảnh.')
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, size, size)

  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Crop ảnh thất bại.'))),
      'image/webp',
      0.9,
    ),
  )
}

export async function uploadPersonPhoto(
  treeId: string,
  personId: string,
  file: File,
): Promise<string> {
  assertValidPhoto(file)
  const square = await cropToSquare(file)
  const path = `${treeId}/${personId}.webp`
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, square, { contentType: 'image/webp', upsert: true })
  if (error) throw error
  return path
}

export async function deletePersonPhoto(path: string): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET).remove([path])
  if (error) throw error
}

// Bucket private (ảnh người còn sống là dữ liệu cá nhân, NFR riêng tư) — luôn
// đọc qua signed URL, không public URL. Trả null nếu lỗi để UI rơi về avatar chữ cái.
export async function getPhotoUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60)
  if (error) return null
  return data.signedUrl
}
