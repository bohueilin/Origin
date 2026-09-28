import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { floorHeroImage } from './staerAdapter'

const mediaDir = fileURLToPath(new URL('../public/factoryceo/floorplans/', import.meta.url))

describe('warehouse illustration publication boundary', () => {
  it('ships no retired dataset photos or remote photo fallbacks', () => {
    expect(readdirSync(mediaDir).filter(name => /^staer-scene/i.test(name))).toEqual([])
    const manifest = readFileSync(`${mediaDir}/manifest.json`, 'utf8')
    expect(manifest).not.toMatch(/staerrobotics|staer-scene|"remote_file"/i)
  })

  it('every gallery selection resolves to an original synthetic illustration', () => {
    for (let index = 0; index < 50; index++) {
      const path = floorHeroImage(index)
      expect(path).toMatch(/^\/factoryceo\/floorplans\/synthetic-.*\.webp$/)
      const data = readFileSync(`${mediaDir}/${path.split('/').pop()}`)
      expect(data.subarray(0, 4).toString()).toBe('RIFF')
      expect(data.subarray(8, 12).toString()).toBe('WEBP')
    }
  })
})
