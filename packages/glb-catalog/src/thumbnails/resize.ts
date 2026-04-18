const TARGET_SIZE = 256
const QUALITY = 0.85

/**
 * User-provided image file -> 256x256 WebP Blob (center-cropped if not square).
 */
export async function resizeImageToThumbnail(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const canvas = 'OffscreenCanvas' in window
    ? new OffscreenCanvas(TARGET_SIZE, TARGET_SIZE)
    : (() => {
        const c = document.createElement('canvas')
        c.width = TARGET_SIZE
        c.height = TARGET_SIZE
        return c
      })()
  const ctx = canvas.getContext('2d') as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null
  if (!ctx) throw new Error('2d context unavailable')

  const s = Math.min(bitmap.width, bitmap.height)
  const sx = (bitmap.width - s) / 2
  const sy = (bitmap.height - s) / 2
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, sx, sy, s, s, 0, 0, TARGET_SIZE, TARGET_SIZE)
  bitmap.close()

  if ('convertToBlob' in canvas) {
    return canvas.convertToBlob({ type: 'image/webp', quality: QUALITY })
  }
  return new Promise<Blob>((resolve, reject) => {
    ;(canvas as HTMLCanvasElement).toBlob(
      (b) => (b ? resolve(b) : reject(new Error('toBlob returned null'))),
      'image/webp',
      QUALITY,
    )
  })
}
