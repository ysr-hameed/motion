export interface Attachment {
  id: string
  name: string
  size: number
  type: string
  dataUrl: string
}

const MAX_FILES = 4
const MAX_BYTES = 2.5 * 1024 * 1024

let seq = 0
const nid = () => `${Date.now()}-${seq++}`

function fileToAttachment(file: File): Promise<Attachment | null> {
  if (!file.type.startsWith("image/") || file.size > MAX_BYTES) return Promise.resolve(null)
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () =>
      resolve({
        id: nid(),
        name: file.name,
        size: file.size,
        type: file.type,
        dataUrl: String(reader.result ?? ""),
      })
    reader.onerror = () => resolve(null)
    reader.readAsDataURL(file)
  })
}

export async function filesToAttachments(
  files: FileList | File[],
  existing = 0
): Promise<Attachment[]> {
  const list = Array.from(files).slice(0, Math.max(0, MAX_FILES - existing))
  const out: Attachment[] = []
  for (const f of list) {
    const a = await fileToAttachment(f)
    if (a) out.push(a)
  }
  return out
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  return `${(bytes / 1024).toFixed(0)} KB`
}

const VISION_MAX_DIM = 1024
const VISION_JPEG_Q = 0.82

/**
 * Downscales an image data URL to a gateway-friendly size (max 1024px,
 * JPEG). Returns the original when anything goes wrong — the backend
 * drops oversize payloads safely.
 */
export function downscaleDataUrl(dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    try {
      const img = new Image()
      img.onload = () => {
        try {
          const scale = Math.min(
            1,
            VISION_MAX_DIM / Math.max(1, img.naturalWidth, img.naturalHeight)
          )
          if (scale >= 1 && dataUrl.length < 500000) {
            resolve(dataUrl)
            return
          }
          const canvas = document.createElement("canvas")
          canvas.width = Math.max(1, Math.round(img.naturalWidth * scale))
          canvas.height = Math.max(1, Math.round(img.naturalHeight * scale))
          const ctx = canvas.getContext("2d")
          if (!ctx) {
            resolve(dataUrl)
            return
          }
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
          resolve(canvas.toDataURL("image/jpeg", VISION_JPEG_Q))
        } catch {
          resolve(dataUrl)
        }
      }
      img.onerror = () => resolve(dataUrl)
      img.src = dataUrl
    } catch {
      resolve(dataUrl)
    }
  })
}

export interface PreparedImage {
  name: string
  dataUrl: string
}

/** First 3 image attachments, downscaled for the director. Never throws. */
export async function preparedImages(
  attachments: Attachment[]
): Promise<PreparedImage[]> {
  const out: PreparedImage[] = []
  for (const a of attachments.slice(0, 3)) {
    if (!a.type.startsWith("image/") || !a.dataUrl.startsWith("data:image/"))
      continue
    try {
      const dataUrl = await downscaleDataUrl(a.dataUrl)
      if (dataUrl.length < 700000) out.push({ name: a.name, dataUrl })
    } catch {
      /* skip unreadable attachments */
    }
  }
  return out
}
