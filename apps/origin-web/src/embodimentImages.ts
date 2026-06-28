// Licensed robot media for each embodiment, shown as a live preview when the
// operator picks a robot in Align (#4). Assets live in public/robots/ and are
// served from the site root. 'other' has no canonical image and falls back to a
// schematic placeholder. AMR ships as a short muted loop (mp4); the rest are
// stills — the preview component branches on `kind`.

import type { RobotEmbodiment } from './environmentPlan'

export interface EmbodimentMedia {
  src: string
  kind: 'image' | 'video'
  alt: string
}

const EMBODIMENT_MEDIA: Partial<Record<RobotEmbodiment, EmbodimentMedia>> = {
  humanoid: { src: '/robots/humanoid.jpg', kind: 'image', alt: 'Humanoid robot' },
  carrier: { src: '/robots/carrier.webp', kind: 'image', alt: 'Carrier / mobile base robot' },
  dog: { src: '/robots/dog.avif', kind: 'image', alt: 'Quadruped (robot dog)' },
  amr: { src: '/robots/amr.mp4', kind: 'video', alt: 'Autonomous mobile robot (AMR)' },
  arm: { src: '/robots/arm.webp', kind: 'image', alt: 'Mobile manipulator arm' },
  drone: { src: '/robots/drone.webp', kind: 'image', alt: 'Aerial drone' },
}

/** Media for an embodiment, or null when none is licensed (e.g. 'other'). */
export function embodimentMedia(embodiment: RobotEmbodiment): EmbodimentMedia | null {
  return EMBODIMENT_MEDIA[embodiment] ?? null
}
