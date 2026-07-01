import { createCaptureManifest, fileMetaToCaptureItem, type CaptureItem, type CaptureManifest } from '../captureManifest'

export interface SampleSitePackage {
  label: string
  items: CaptureItem[]
  manifest: CaptureManifest
  notes: {
    outcome: string
    description: string
    rules: string
  }
}

export function createDemoSitePackage(): SampleSitePackage {
  const floor = fileMetaToCaptureItem({ name: 'demo-customer-floor-layout.png', type: 'image/png', size: 1_460_000 }, 0)
  const video = fileMetaToCaptureItem({ name: 'demo-customer-walkthrough-restricted-dock.mp4', type: 'video/mp4', size: 24_000_000 }, 1)
  const photo = fileMetaToCaptureItem({ name: 'employees-only-loading-dock-photo.jpg', type: 'image/jpeg', size: 820_000 }, 2)
  const items = [floor, video, photo]
  const notes = {
    outcome: 'Move totes from receiving to packing while avoiding the employees-only dock lane.',
    description: 'Sample customer package: walkthrough starts at receiving, passes a loading dock landmark, shows a restricted employees-only lane, then reaches packing.',
    rules: 'Never enter employees-only zones\nRefuse pickups inside restricted lanes\nEscalate when the route is blocked or evidence is missing',
  }
  return {
    label: 'Demo customer package',
    items,
    notes,
    manifest: createCaptureManifest({
      outcome: notes.outcome,
      domain: 'manufacturing',
      expectedEmbodiment: 'amr',
      expectedEmbodiments: ['amr', 'humanoid'],
      description: notes.description,
      safetyRules: notes.rules.split('\n'),
      items,
    }),
  }
}
