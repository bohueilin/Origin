import { describe, expect, it } from 'vitest'
import {
  countDeclaredWorkflowInputs,
  createCaptureManifest,
  driveLinkToCaptureItem,
  fileMetaToCaptureItem,
  summarizeInputManifest,
} from './captureManifest'

describe('captureManifest', () => {
  it('stores serializable local file metadata only', () => {
    const item = fileMetaToCaptureItem({ name: 'dad-floor.mp4', type: 'video/mp4', size: 42_000_000 }, 0)
    expect(item.role).toBe('workflow_video')
    expect(item.name).toBe('dad-floor.mp4')
    expect(item.type).toBe('video/mp4')
    expect(item.size).toBe(42_000_000)
    expect(JSON.stringify(item)).not.toContain('File')
  })

  it('captures Google Drive links as declared links', () => {
    const item = driveLinkToCaptureItem('https://drive.google.com/file/demo', 1)
    expect(item?.kind).toBe('google_drive_link')
    expect(item?.role).toBe('google_drive')
    expect(item?.size).toBeNull()
  })

  it('builds a deterministic manifest summary', () => {
    const items = [
      fileMetaToCaptureItem({ name: 'floor.pdf', type: 'application/pdf', size: 1000 }, 0),
      fileMetaToCaptureItem({ name: 'unsafe-lane.png', type: 'image/png', size: 2000 }, 1),
    ]
    const manifest = createCaptureManifest({
      outcome: 'factory assistant',
      domain: 'manufacturing',
      expectedEmbodiment: 'humanoid',
      description: 'move totes',
      safetyRules: ['do not enter forklift lane'],
      items,
    })
    expect(createCaptureManifest({ ...manifest }).id).toBe(manifest.id)
    // outcome + description + 2 media items = 4 declared workflow inputs (was media-only).
    expect(countDeclaredWorkflowInputs(manifest)).toBe(4)
    expect(summarizeInputManifest(manifest)).toContain('4 declared input')
  })

  it('counts voice/text-only declared inputs without inventing media', () => {
    const manifest = createCaptureManifest({
      outcome: 'move totes safely',
      domain: 'manufacturing',
      expectedEmbodiment: 'humanoid',
      description: 'pick from inbound, drop at packing, avoid the forklift lane',
      safetyRules: ['no forklift lane', 'stop near people', 'escalate on spills'],
      items: [],
    })
    expect(countDeclaredWorkflowInputs(manifest)).toBe(2)
    const summary = summarizeInputManifest(manifest)
    expect(summary).toContain('2 declared input(s)')
    expect(summary).toContain('outcome requirement')
    expect(summary).toContain('workflow description')
    expect(summary).toContain('3 safety rule(s)')
    expect(summary).not.toContain('none')
  })

  it('counts text facts plus media/link items in a mixed manifest', () => {
    const items = [
      fileMetaToCaptureItem({ name: 'line.mp4', type: 'video/mp4', size: 5000 }, 0),
      driveLinkToCaptureItem('https://drive.google.com/file/sop', 1)!,
    ]
    const manifest = createCaptureManifest({
      outcome: 'factory assistant',
      domain: 'manufacturing',
      expectedEmbodiment: 'humanoid',
      description: 'move totes',
      safetyRules: ['do not enter forklift lane'],
      items,
    })
    expect(countDeclaredWorkflowInputs(manifest)).toBe(4)
    const summary = summarizeInputManifest(manifest)
    expect(summary).toContain('4 declared input(s)')
    expect(summary).toContain('outcome requirement')
    expect(summary).toContain('workflow description')
    expect(summary).toContain('1 workflow video')
    expect(summary).toContain('1 Google Drive link')
    expect(summary).toContain('1 safety rule(s)')
  })
})

