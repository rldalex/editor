import {
  AmbientLight,
  Box3,
  DirectionalLight,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

const SIZE_INTERNAL = 512
const SIZE_STORED = 256
const QUALITY = 0.85

function createCanvas(w: number, h: number): HTMLCanvasElement | OffscreenCanvas {
  if (typeof window !== 'undefined' && 'OffscreenCanvas' in window) {
    return new OffscreenCanvas(w, h)
  }
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

async function canvasToWebpBlob(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  quality: number,
): Promise<Blob> {
  if ('convertToBlob' in canvas) {
    return canvas.convertToBlob({ type: 'image/webp', quality })
  }
  return new Promise<Blob>((resolve, reject) => {
    ;(canvas as HTMLCanvasElement).toBlob(
      (b) => (b ? resolve(b) : reject(new Error('toBlob returned null'))),
      'image/webp',
      quality,
    )
  })
}

async function downsampleBlob(
  sourceBlob: Blob,
  targetSize: number,
): Promise<Blob> {
  const bitmap = await createImageBitmap(sourceBlob)
  const canvas = createCanvas(targetSize, targetSize)
  const ctx = canvas.getContext('2d') as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null
  if (!ctx) throw new Error('2d context unavailable')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, 0, 0, targetSize, targetSize)
  bitmap.close()
  return canvasToWebpBlob(canvas, QUALITY)
}

/**
 * Render a GLB blob to a 256x256 WebP thumbnail using a 3/4 auto-framed view.
 * Pipeline : render 512x512 WebGL2 offscreen -> downsample canvas 2d -> WebP.
 */
export async function renderThumbnail(glbBlob: Blob): Promise<Blob> {
  const canvas = createCanvas(SIZE_INTERNAL, SIZE_INTERNAL)
  const renderer = new WebGLRenderer({
    canvas: canvas as HTMLCanvasElement,
    antialias: true,
    alpha: false,
  })
  renderer.setClearColor(0x2c2c2e, 1)
  renderer.setSize(SIZE_INTERNAL, SIZE_INTERNAL, false)

  const scene = new Scene()
  const arrayBuffer = await glbBlob.arrayBuffer()
  const gltf = await new GLTFLoader().parseAsync(arrayBuffer, '')
  scene.add(gltf.scene)

  scene.add(new AmbientLight(0xffffff, 0.7))
  const key = new DirectionalLight(0xffffff, 0.9)
  key.position.set(2, 3, 2)
  scene.add(key)

  const bbox = new Box3().setFromObject(gltf.scene)
  const size = bbox.getSize(new Vector3())
  const center = bbox.getCenter(new Vector3())
  const diagonal = Math.max(size.length(), 0.1) // guard tiny/empty

  const camera = new PerspectiveCamera(40, 1, diagonal * 0.05, diagonal * 20)
  camera.position.set(
    center.x + diagonal * 1.0,
    center.y + diagonal * 0.8,
    center.z + diagonal * 1.3,
  )
  camera.lookAt(center)

  renderer.render(scene, camera)
  const rawBlob = await canvasToWebpBlob(canvas, QUALITY)
  renderer.dispose()

  return downsampleBlob(rawBlob, SIZE_STORED)
}
