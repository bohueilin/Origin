// Reference illustrations for each robot type, shown when the operator picks a
// robot in Align. They are original, generic drawings made for this site — no
// manufacturer's product, logo or photo — so a customer can recognise the TYPE.
// Assets live in public/robots/ as SVG. 'other' has no canonical drawing and
// falls back to the "No reference image" placeholder.

import type { RobotEmbodiment } from './environmentPlan'

export interface EmbodimentMedia {
  src: string
  alt: string
}

const EMBODIMENT_MEDIA: Partial<Record<RobotEmbodiment, EmbodimentMedia>> = {
  humanoid: { src: '/robots/humanoid.svg', alt: 'Illustration of a humanoid robot' },
  carrier: { src: '/robots/carrier.svg', alt: 'Illustration of a carrier (mobile flatbed) robot' },
  dog: { src: '/robots/dog.svg', alt: 'Illustration of a quadruped (legged) robot' },
  amr: { src: '/robots/amr.svg', alt: 'Illustration of an autonomous mobile robot (AMR)' },
  arm: { src: '/robots/arm.svg', alt: 'Illustration of a mobile manipulator arm' },
  drone: { src: '/robots/drone.svg', alt: 'Illustration of a quadcopter drone' },
  forklift: { src: '/robots/forklift.svg', alt: 'Illustration of a driverless forklift carrying a pallet' },
  tugger: { src: '/robots/tugger.svg', alt: 'Illustration of a tugger (tow AGV) pulling two carts' },
  scrubber: { src: '/robots/scrubber.svg', alt: 'Illustration of an autonomous floor scrubber' },
  delivery: { src: '/robots/delivery.svg', alt: 'Illustration of an indoor delivery robot' },
}

/** Reference illustration for an embodiment, or null when none exists (e.g. 'other'). */
export function embodimentMedia(embodiment: RobotEmbodiment): EmbodimentMedia | null {
  return EMBODIMENT_MEDIA[embodiment] ?? null
}
