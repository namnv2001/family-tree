import { saveFile } from './store'

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

// Center-crop về hình vuông trước khi lưu — luôn ghi lại thành webp, nên
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

// Tên file mới mỗi lần upload: GitHub Pages cache ảnh theo URL, ghi đè cùng tên
// thì người xem vẫn thấy ảnh cũ tới khi cache hết hạn.
export async function uploadPersonPhoto(personId: string, file: File): Promise<string> {
  assertValidPhoto(file)
  const square = await cropToSquare(file)
  const path = `photos/${personId}-${Date.now()}.webp`
  await saveFile(path, square)
  return path
}

export async function deletePersonPhoto(path: string): Promise<void> {
  await saveFile(path, null, 'DELETE')
}

export function photoUrl(path: string): string {
  return `${import.meta.env.BASE_URL}${path}`
}
