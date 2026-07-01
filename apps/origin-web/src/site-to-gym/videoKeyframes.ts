import type { CaptureItem } from '../captureManifest'
import type { VideoKeyframeArtifact } from './types'

const FRAME_OFFSETS = [0.08, 0.34, 0.62, 0.88]

function labelFor(index: number): string {
  return ['Entry view', 'Path continuity', 'Obstacle scan', 'Goal approach'][index] ?? `Frame ${index + 1}`
}

function observationFor(item: CaptureItem, index: number): string {
  const base = item.name.replace(/\.[^.]+$/, '')
  const observations = [
    `Opening view from ${base}; used as the start-area context.`,
    `Middle segment from ${base}; used to infer path continuity and turn sequence.`,
    `Later segment from ${base}; used to mark likely obstacles or human-only cues for review.`,
    `Final segment from ${base}; used to infer drop/goal context and remaining uncertainty.`,
  ]
  return observations[index] ?? `Frame ${index + 1} from ${base}; queued for operator review.`
}

export function simulatedVideoKeyframes(item: CaptureItem, count = 4): VideoKeyframeArtifact[] {
  return FRAME_OFFSETS.slice(0, count).map((ratio, index) => ({
    id: `${item.id}_kf_${index + 1}`,
    label: labelFor(index),
    offsetSeconds: Math.round(ratio * 90),
    confidence: 0.52,
    simulated: true,
    observation: observationFor(item, index),
  }))
}

function waitFor(target: HTMLMediaElement, event: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup()
      reject(new Error(`Timed out waiting for ${event}`))
    }, timeoutMs)
    const cleanup = () => {
      window.clearTimeout(timer)
      target.removeEventListener(event, onEvent)
      target.removeEventListener('error', onError)
    }
    const onEvent = () => {
      cleanup()
      resolve()
    }
    const onError = () => {
      cleanup()
      reject(new Error(`Video could not emit ${event}`))
    }
    target.addEventListener(event, onEvent, { once: true })
    target.addEventListener('error', onError, { once: true })
  })
}

async function seek(video: HTMLVideoElement, seconds: number): Promise<void> {
  video.currentTime = Math.max(0, Math.min(seconds, Math.max(0, video.duration - 0.05)))
  await waitFor(video, 'seeked', 2500)
}

export async function extractVideoKeyframesFromFile(
  item: CaptureItem,
  file: File,
  count = 4,
): Promise<VideoKeyframeArtifact[]> {
  if (typeof document === 'undefined' || typeof URL === 'undefined') {
    return simulatedVideoKeyframes(item, count)
  }

  const url = URL.createObjectURL(file)
  const video = document.createElement('video')
  video.muted = true
  video.preload = 'metadata'
  video.playsInline = true
  video.src = url

  try {
    await waitFor(video, 'loadedmetadata', 3500)
    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 90
    const width = Math.max(1, Math.min(320, video.videoWidth || 320))
    const height = Math.max(1, Math.round(width * ((video.videoHeight || 180) / (video.videoWidth || 320))))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return simulatedVideoKeyframes(item, count)

    const frames: VideoKeyframeArtifact[] = []
    for (let index = 0; index < Math.min(count, FRAME_OFFSETS.length); index += 1) {
      const offsetSeconds = Math.round(FRAME_OFFSETS[index] * duration * 10) / 10
      await seek(video, offsetSeconds)
      ctx.drawImage(video, 0, 0, width, height)
      frames.push({
        id: `${item.id}_kf_${index + 1}`,
        label: labelFor(index),
        offsetSeconds,
        confidence: 0.68,
        thumbnailDataUrl: canvas.toDataURL('image/jpeg', 0.72),
        simulated: false,
        observation: observationFor(item, index),
      })
    }
    return frames.length ? frames : simulatedVideoKeyframes(item, count)
  } catch {
    return simulatedVideoKeyframes(item, count)
  } finally {
    URL.revokeObjectURL(url)
  }
}
