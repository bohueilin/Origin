// 3D proving ground — renders the SAME deterministic multi-robot plan the 2D
// MultiRobotSim uses (planMultiAgent), in a realistic Three.js warehouse. Robots
// are modelled to match the chosen embodiment (humanoid, dog, drone, arm, carrier,
// AMR), drive to their item, lift a box, carry it to the drop, stack it, and return
// home. High-bay racking gives real warehouse height; boxes stack only on the drop.
// Nothing here re-plans or re-scores — it's faithful 3D playback of the oracle plan.

import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { DescriptiveSiteMap } from '../workflowDraft'
import { siteFleets } from '../workflowDraft'
import { planMultiAgent, type MultiAgentPlan } from '../multiAgent'
import type { GridPos } from '../warehouse'
import type { RobotEmbodiment, PhysicalDomain } from '../environmentPlan'

const FLEET_COLORS = [0x2f6df6, 0x0f9d6e, 0xb97400, 0x7c3aed, 0xdb2777, 0x0891b2]
const TICK_SECONDS = 0.78
const CARGO = 0xc79a5b
const RACK_H = 5.6 // high-bay racking height in cells (≈ a tall warehouse aisle)
const CYCLE: RobotEmbodiment[] = ['amr', 'humanoid', 'dog', 'arm', 'drone', 'carrier']

function smoother(t: number) {
  const c = Math.max(0, Math.min(1, t))
  return c * c * c * (c * (c * 6 - 15) + 10)
}

type Built = {
  group: THREE.Group; cargo: THREE.Mesh; fly: number
  rotors: THREE.Mesh[]; wheels: THREE.Mesh[]; legs: THREE.Mesh[]
}

const CARGO_GEO = new THREE.BoxGeometry(0.42, 0.4, 0.42)

function robotModel(emb: RobotEmbodiment, color: number): Built {
  const g = new THREE.Group()
  const body = new THREE.MeshStandardMaterial({ color, roughness: 0.42, metalness: 0.25 })
  const dark = new THREE.MeshStandardMaterial({ color: 0x1b2330, roughness: 0.6, metalness: 0.3 })
  const tyre = new THREE.MeshStandardMaterial({ color: 0x0c1118, roughness: 0.8 })
  const cargoMat = new THREE.MeshStandardMaterial({ color: CARGO, roughness: 0.78 })
  const rotors: THREE.Mesh[] = [], wheels: THREE.Mesh[] = [], legs: THREE.Mesh[] = []
  const cargo = new THREE.Mesh(CARGO_GEO, cargoMat)
  cargo.castShadow = true; cargo.visible = false
  let fly = 0

  const wheel = (x: number, z: number, r = 0.11) => {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.09, 16), tyre)
    w.rotation.z = Math.PI / 2; w.position.set(x, r, z); w.castShadow = true; g.add(w); wheels.push(w)
  }

  if (emb === 'humanoid') {
    const hip = new THREE.Group(); hip.position.y = 0.78; g.add(hip)
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.5, 0.22), body)
    torso.position.y = 0.25; torso.castShadow = true; hip.add(torso)
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 20, 16), dark)
    head.position.y = 0.62; head.castShadow = true; hip.add(head)
    for (const sx of [-0.26, 0.26]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.42, 0.1), body)
      arm.position.set(sx, 0.2, 0.06); arm.rotation.x = -0.5; arm.castShadow = true; hip.add(arm)
    }
    for (const sx of [-0.12, 0.12]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.74, 0.15), dark)
      leg.position.set(sx, -0.37, 0); leg.castShadow = true
      const pivot = new THREE.Group(); pivot.position.set(sx, 0, 0); pivot.add(leg)
      leg.position.set(0, -0.37, 0); hip.add(pivot); legs.push(pivot as unknown as THREE.Mesh)
    }
    cargo.position.set(0, 0.95, 0.3) // held in front, chest height
    g.add(cargo)
  } else if (emb === 'dog') {
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.26, 0.34), body)
    torso.position.y = 0.46; torso.castShadow = true; g.add(torso)
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.2, 0.22), dark)
    head.position.set(0, 0.52, 0.34); head.castShadow = true; g.add(head)
    for (const sx of [-0.28, 0.28]) for (const sz of [-0.13, 0.13]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.46, 0.08), dark)
      const pivot = new THREE.Group(); pivot.position.set(sx, 0.46, sz)
      leg.position.y = -0.23; leg.castShadow = true; pivot.add(leg); g.add(pivot); legs.push(pivot as unknown as THREE.Mesh)
    }
    cargo.position.set(0, 0.74, 0) // on the back
    g.add(cargo)
  } else if (emb === 'drone') {
    fly = 1.7
    const core = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.34), body)
    core.castShadow = true; g.add(core)
    for (const [ax, az] of [[0.3, 0.3], [-0.3, 0.3], [0.3, -0.3], [-0.3, -0.3]] as const) {
      const armM = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.04, 0.34), body)
      armM.position.set(ax * 0.5, 0, az * 0.5); armM.lookAt(ax, 0, az); g.add(armM)
      const rotor = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.015, 18), dark)
      rotor.position.set(ax, 0.08, az); g.add(rotor); rotors.push(rotor)
    }
    cargo.position.set(0, -0.42, 0) // slung underneath
    g.add(cargo)
  } else if (emb === 'arm') {
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.2, 0.58), body)
    base.position.y = 0.18; base.castShadow = true; g.add(base)
    wheel(-0.24, -0.22); wheel(0.24, -0.22); wheel(-0.24, 0.22); wheel(0.24, 0.22)
    const seg1 = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.5, 14), dark)
    seg1.position.set(0, 0.5, 0); seg1.castShadow = true; g.add(seg1)
    const seg2 = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.46, 14), dark)
    seg2.position.set(0, 0.78, 0.2); seg2.rotation.x = 0.9; seg2.castShadow = true; g.add(seg2)
    cargo.position.set(0, 0.82, 0.44) // gripped out in front
    g.add(cargo)
  } else if (emb === 'carrier') {
    const deck = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.16, 1.04), body)
    deck.position.y = 0.22; deck.castShadow = true; g.add(deck)
    const lip = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.1, 0.06), dark)
    lip.position.set(0, 0.32, -0.5); g.add(lip)
    for (const sz of [-0.36, 0, 0.36]) { wheel(-0.36, sz, 0.12); wheel(0.36, sz, 0.12) }
    cargo.position.set(0, 0.5, 0) // on the flatbed
    g.add(cargo)
  } else { // amr (default)
    const shell = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.24, 0.76), body)
    shell.position.y = 0.2; shell.castShadow = true; shell.receiveShadow = true; g.add(shell)
    const deck = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.6), dark)
    deck.position.y = 0.35; g.add(deck)
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.1, 0.05), new THREE.MeshStandardMaterial({ color: 0x0b1220 }))
    eye.position.set(0, 0.24, 0.38); g.add(eye)
    wheel(-0.26, -0.28); wheel(0.26, -0.28); wheel(-0.26, 0.28); wheel(0.26, 0.28)
    cargo.position.set(0, 0.52, 0)
    g.add(cargo)
  }
  return { group: g, cargo, fly, rotors, wheels, legs }
}

function humanWorker(): THREE.Group {
  const g = new THREE.Group()
  const vest = new THREE.MeshStandardMaterial({ color: 0xf5a623, roughness: 0.7 })
  const skin = new THREE.MeshStandardMaterial({ color: 0xd7a877, roughness: 0.7 })
  const pants = new THREE.MeshStandardMaterial({ color: 0x2b2f36, roughness: 0.8 })
  const hat = new THREE.MeshStandardMaterial({ color: 0xf5d020, roughness: 0.5 })
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.42, 0.18), vest); torso.position.y = 0.82; torso.castShadow = true; g.add(torso)
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 18, 14), skin); head.position.y = 1.16; head.castShadow = true; g.add(head)
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.13, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), hat); cap.position.y = 1.2; g.add(cap)
  for (const sx of [-0.18, 0.18]) { const a = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.4, 0.08), vest); a.position.set(sx, 0.78, 0); a.castShadow = true; g.add(a) }
  for (const sx of [-0.09, 0.09]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.6, 0.12), pants); l.position.set(sx, 0.3, 0); l.castShadow = true; g.add(l) }
  return g
}

// Fixed structures vary by the user's domain — a warehouse has high-bay racks, a
// hospital has supply cabinets, a lab has fume-hood benches, a plant has machine
// cells. Each obstacle cell renders the structure that fits the domain.
const DOMAIN_FLOOR: Record<PhysicalDomain, number> = {
  warehouse: 0xeef1f4, logistics: 0xedf0f3, manufacturing: 0xe7eaee,
  hospital: 0xeef5f4, lab: 0xeaeef2, eldercare: 0xf3ede3,
}
const DOMAIN_STRUCT_LABEL: Record<PhysicalDomain, string> = {
  warehouse: 'high-bay rack', logistics: 'high-bay rack', manufacturing: 'machine cell',
  hospital: 'supply cabinet', lab: 'lab bench + hood', eldercare: 'storage unit',
}

function obstacleProp(domain: PhysicalDomain): THREE.Group {
  const g = new THREE.Group()
  const M = (color: number, rough = 0.7, metal = 0.15) =>
    new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal })
  const box = (w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
    m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; g.add(m); return m
  }
  if (domain === 'hospital') {
    box(0.86, 2.3, 0.7, M(0xeef3f7, 0.6), 0, 1.15, 0)                 // white cabinet body
    for (const ly of [0.6, 1.2, 1.8]) box(0.82, 0.05, 0.66, M(0xc3cdd6, 0.5, 0.4), 0, ly, 0)
    ;[0x2f9e8f, 0x2f6df6, 0xd98324].forEach((c, i) =>               // colored supply totes
      box(0.22, 0.18, 0.5, M(c, 0.7), -0.26 + i * 0.26, 0.72, 0.05))
    box(0.3, 0.08, 0.02, M(0xd23b3b), 0, 2.0, 0.36)                  // red cross
    box(0.08, 0.3, 0.02, M(0xd23b3b), 0, 2.0, 0.36)
  } else if (domain === 'lab') {
    box(0.9, 0.95, 0.7, M(0x2b3038, 0.5, 0.3), 0, 0.48, 0)           // dark bench cabinet
    box(0.92, 0.06, 0.72, M(0x9aa3b0, 0.3, 0.6), 0, 0.98, 0)         // steel worktop
    const glass = new THREE.MeshStandardMaterial({ color: 0xbfe3ec, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.38 })
    box(0.9, 1.3, 0.5, glass, 0, 1.7, -0.05)                         // fume-hood glass
    box(0.9, 0.1, 0.7, M(0x3a4048, 0.4, 0.5), 0, 2.4, 0)            // hood top
    for (const sx of [-0.2, 0.2]) {                                  // glassware
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.22, 12), glass)
      c.position.set(sx, 1.12, 0.1); g.add(c)
    }
  } else if (domain === 'manufacturing') {
    box(0.95, 1.0, 0.8, M(0x3d444d, 0.5, 0.5), 0, 0.5, 0)            // machine base
    box(0.99, 0.5, 0.84, M(0xf2c029, 0.5, 0.3), 0, 1.25, 0)         // yellow safety housing
    box(0.3, 0.3, 0.3, M(0x20242a, 0.4, 0.7), 0, 1.7, 0)
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.8, 12), M(0xd0d4da, 0.4, 0.6))
    arm.position.set(0, 2.0, 0.1); arm.rotation.z = 0.5; arm.castShadow = true; g.add(arm)
  } else if (domain === 'eldercare') {
    box(0.84, 2.0, 0.66, M(0xb08453, 0.8, 0.05), 0, 1.0, 0)          // warm wooden wardrobe
    for (const ly of [0.55, 1.1, 1.65]) box(0.8, 0.05, 0.6, M(0x8a6238, 0.8), 0, ly, 0)
    box(0.86, 0.08, 0.7, M(0x946b3f, 0.8), 0, 2.02, 0)
  } else {
    // warehouse / logistics — high-bay racking (the original tall warehouse aisle)
    const upMat = M(0xe3741f, 0.55, 0.2), beamMat = M(0x1f3a8a, 0.5, 0.2), palMat = M(0xb9905a, 0.85)
    const upGeo = new THREE.BoxGeometry(0.08, RACK_H, 0.08)
    const beamGeo = new THREE.BoxGeometry(0.86, 0.07, 0.07), palGeo = new THREE.BoxGeometry(0.7, 0.34, 0.7)
    for (const sx of [-0.42, 0.42]) for (const sz of [-0.42, 0.42]) {
      const up = new THREE.Mesh(upGeo, upMat); up.position.set(sx, RACK_H / 2, sz); up.castShadow = true; g.add(up)
    }
    ;[1.3, 2.6, 3.9, 5.2].forEach((ly, li) => {
      for (const sz of [-0.42, 0.42]) { const b = new THREE.Mesh(beamGeo, beamMat); b.position.set(0, ly, sz); b.castShadow = true; g.add(b) }
      if (li % 2 === 0) { const p = new THREE.Mesh(palGeo, palMat); p.position.set(0, ly + 0.21, 0); p.castShadow = true; g.add(p) }
    })
  }
  return g
}

export function ProvingGround3D({ siteMap, embodiment, domain = 'warehouse' }: {
  siteMap: DescriptiveSiteMap; verdict?: string; embodiment?: RobotEmbodiment; domain?: PhysicalDomain
}) {
  const mountRef = useRef<HTMLDivElement | null>(null)
  const playingRef = useRef(true)
  const speedRef = useRef(1)
  const progFillRef = useRef<HTMLDivElement | null>(null)
  const progTxtRef = useRef<HTMLSpanElement | null>(null)
  const [playing, setPlaying] = useState(true)
  const [speed, setSpeed] = useState(1)
  const webglOK = useMemo(() => {
    try {
      const c = document.createElement('canvas')
      return !!(window.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl')))
    } catch { return false }
  }, [])
  const emb: RobotEmbodiment = embodiment ?? 'amr'

  const { plan, robotFleet, fleetEmbs } = useMemo(() => {
    const fleets = siteFleets(siteMap)
    const fEmbs = fleets.map((f) => f.embodiment)
    let robots: GridPos[] = fleets.flatMap((f) => f.robots)
    let items: GridPos[] = fleets.flatMap((f) => f.items)
    let drops: GridPos[] = fleets.flatMap((f) => f.drops)
    let rFleet = fleets.flatMap((f, fi) => f.robots.map(() => fi))
    let iFleet = fleets.flatMap((f, fi) => f.items.map(() => fi))
    let dFleet = fleets.flatMap((f, fi) => f.drops.map(() => fi))
    if (robots.length === 0) {
      robots = [siteMap.start]; items = [siteMap.item]; drops = [siteMap.drop]
      rFleet = [0]; iFleet = [0]; dFleet = [0]
    }
    const p = planMultiAgent({
      width: siteMap.width, height: siteMap.height,
      blocked: siteMap.obstacles, unsafe: [...siteMap.hazards, ...siteMap.humanOnly],
      robots, items, drops, robotFleet: rFleet, itemFleet: iFleet, dropFleet: dFleet,
    })
    return { plan: p as MultiAgentPlan, robotFleet: rFleet, fleetEmbs: fEmbs }
  }, [siteMap])

  useEffect(() => {
    const mount = mountRef.current
    if (!mount || !webglOK) return
    const W = siteMap.width, H = siteMap.height
    const maxDim = Math.max(W, H)
    const wx = (x: number) => x - W / 2 + 0.5
    const wz = (y: number) => y - H / 2 + 0.5

    let renderer: THREE.WebGLRenderer
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }) } catch { return }
    const w0 = mount.clientWidth || 820, h0 = mount.clientHeight || 520
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.setSize(w0, h0)
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.05
    renderer.outputColorSpace = THREE.SRGBColorSpace
    mount.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0xe9edf2)
    scene.fog = new THREE.Fog(0xe9edf2, maxDim * 2.4, maxDim * 6)

    const camera = new THREE.PerspectiveCamera(46, w0 / h0, 0.1, 1000)
    camera.position.set(maxDim * 0.95, maxDim * 0.95 + 3.2, maxDim * 1.25)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true; controls.dampingFactor = 0.08
    controls.target.set(0, 1.1, 0)
    controls.minDistance = maxDim * 0.55; controls.maxDistance = maxDim * 3.6
    controls.maxPolarAngle = Math.PI * 0.49
    controls.update()

    scene.add(new THREE.HemisphereLight(0xffffff, 0x9aa3b0, 0.7))
    const sun = new THREE.DirectionalLight(0xfff4e6, 1.05)
    sun.position.set(W * 0.7, maxDim * 1.7, H * 0.55); sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    const d = maxDim
    sun.shadow.camera.left = -d; sun.shadow.camera.right = d
    sun.shadow.camera.top = d; sun.shadow.camera.bottom = -d
    sun.shadow.camera.near = 0.5; sun.shadow.camera.far = maxDim * 5
    scene.add(sun)
    const fill = new THREE.DirectionalLight(0xcdd8ff, 0.3)
    fill.position.set(-W * 0.6, maxDim, -H * 0.5); scene.add(fill)

    // floor: concrete pad + a larger ground for depth
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(maxDim * 5, maxDim * 5),
      new THREE.MeshStandardMaterial({ color: 0xcfd4da, roughness: 1 }))
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.04; ground.receiveShadow = true; scene.add(ground)
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, H),
      new THREE.MeshStandardMaterial({ color: DOMAIN_FLOOR[domain] ?? 0xeef1f4, roughness: 0.95 }))
    floor.rotation.x = -Math.PI / 2; floor.position.y = -0.02; floor.receiveShadow = true; scene.add(floor)

    const gpts: number[] = []
    for (let x = 0; x <= W; x++) gpts.push(x - W / 2, 0, -H / 2, x - W / 2, 0, H / 2)
    for (let y = 0; y <= H; y++) gpts.push(-W / 2, 0, y - H / 2, W / 2, 0, y - H / 2)
    const grid = new THREE.LineSegments(
      new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(gpts, 3)),
      new THREE.LineBasicMaterial({ color: 0xd2d7df }))
    grid.position.y = 0.002; scene.add(grid)

    const tileGeo = new THREE.PlaneGeometry(0.92, 0.92)
    const haz = new THREE.MeshStandardMaterial({ color: 0xe0563f, roughness: 1, transparent: true, opacity: 0.5 })
    const hum = new THREE.MeshStandardMaterial({ color: 0xd79b2e, roughness: 1, transparent: true, opacity: 0.42 })
    for (const c of siteMap.hazards ?? []) { const t = new THREE.Mesh(tileGeo, haz); t.rotation.x = -Math.PI / 2; t.position.set(wx(c.x), 0.012, wz(c.y)); scene.add(t) }
    const humans: THREE.Group[] = []
    for (const c of siteMap.humanOnly ?? []) {
      const t = new THREE.Mesh(tileGeo, hum); t.rotation.x = -Math.PI / 2; t.position.set(wx(c.x), 0.012, wz(c.y)); scene.add(t)
      const person = humanWorker(); person.position.set(wx(c.x), 0, wz(c.y)); person.rotation.y = Math.random() * Math.PI; scene.add(person); humans.push(person)
    }

    // fixed structures at every obstacle cell — shaped to the user's domain
    // (warehouse racks · hospital cabinets · lab benches · machine cells · …)
    for (const o of siteMap.obstacles ?? []) {
      const prop = obstacleProp(domain)
      prop.position.set(wx(o.x), 0, wz(o.y)); scene.add(prop)
    }

    // item pallets + cargo to pick
    const fleets = siteFleets(siteMap)
    let flatItems: GridPos[] = fleets.flatMap((f) => f.items)
    let flatDrops: GridPos[] = fleets.flatMap((f) => f.drops)
    let flatDropFleet = fleets.flatMap((f, fi) => f.drops.map(() => fi))
    if (flatItems.length === 0) { flatItems = [siteMap.item]; flatDrops = [siteMap.drop]; flatDropFleet = [0] }
    const cargoMat = new THREE.MeshStandardMaterial({ color: CARGO, roughness: 0.78 })
    const palletMat = new THREE.MeshStandardMaterial({ color: 0x8a6a43, roughness: 0.9 })
    const padMat = (fi: number) => new THREE.MeshStandardMaterial({ color: FLEET_COLORS[fi % FLEET_COLORS.length], roughness: 1, transparent: true, opacity: 0.3 })
    const itemBoxes: { mesh: THREE.Mesh; pickTick: number }[] = []
    flatItems.forEach((it, i) => {
      const pallet = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.1, 0.6), palletMat)
      pallet.position.set(wx(it.x), 0.05, wz(it.y)); pallet.receiveShadow = true; scene.add(pallet)
      const box = new THREE.Mesh(CARGO_GEO, cargoMat)
      box.position.set(wx(it.x), 0.3, wz(it.y)); box.castShadow = true; scene.add(box)
      itemBoxes.push({ mesh: box, pickTick: plan.itemPickTick[i] ?? Infinity })
    })
    // drop zones — painted outline; boxes stack ONLY here
    flatDrops.forEach((dp, i) => {
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.34, 0.46, 4, 1), padMat(flatDropFleet[i] ?? 0))
      ring.rotation.x = -Math.PI / 2; ring.rotation.z = Math.PI / 4; ring.position.set(wx(dp.x), 0.016, wz(dp.y)); scene.add(ring)
    })

    // delivered boxes — stack tall at the drop, revealed as each drop happens
    type Delivered = { mesh: THREE.Mesh; tick: number }
    const delivered: Delivered[] = []
    const stackAt: Record<string, number> = {}
    // A box is dropped on the tick the robot RELEASES it (carrying t → not t+1).
    // The drop happens on the cell the robot is standing on WHILE still carrying
    // (timeline[t]) — NOT timeline[t+1], which is where it has already moved next.
    // Snap to the real drop cell to be provably correct regardless of plan timing.
    const dropSet = new Set(flatDrops.map((d) => `${d.x},${d.y}`))
    plan.robots.forEach((r) => {
      for (let t = 0; t + 1 < r.carryingAt.length; t++) {
        if (r.carryingAt[t] && !r.carryingAt[t + 1]) {
          const here = r.timeline[Math.min(t, r.timeline.length - 1)]
          const next = r.timeline[Math.min(t + 1, r.timeline.length - 1)]
          // prefer whichever transition cell is an actual drop zone; else the
          // carrying cell (where the release occurred).
          const cell = [here, next].find((c) => c && dropSet.has(`${c.x},${c.y}`)) ?? here
          const k = `${cell.x},${cell.y}`; const h = stackAt[k] ?? 0; stackAt[k] = h + 1
          const box = new THREE.Mesh(CARGO_GEO, cargoMat)
          box.position.set(wx(cell.x), 0.22 + h * 0.42, wz(cell.y)); box.castShadow = true; box.visible = false
          scene.add(box); delivered.push({ mesh: box, tick: t + 1 })
        }
      }
    })

    // robots — embodiment-aware
    const botEmb: RobotEmbodiment[] = []
    const bots: Built[] = plan.robots.map((r) => {
      const fi = robotFleet[r.index] ?? r.fleet ?? 0
      // resolve each robot's type: explicit per-robot → its fleet's type → workflow
      // ('other' cycles types per robot for a visibly mixed fleet).
      const home = r.start ?? { x: 0, y: 0 }
      const perRobot = siteMap.robotTypes?.[`${home.x},${home.y}`]
      const useEmb = perRobot ?? fleetEmbs[fi] ?? (emb === 'other' ? CYCLE[r.index % CYCLE.length] : emb)
      botEmb.push(useEmb)
      const built = robotModel(useEmb, FLEET_COLORS[fi % FLEET_COLORS.length])
      const s = r.start ?? { x: 0, y: 0 }
      built.group.position.set(wx(s.x), built.fly, wz(s.y))
      scene.add(built.group)
      return built
    })

    const ticks = Math.max(plan.ticks, 1)
    const clock = new THREE.Clock()
    let tickF = 0, raf = 0, disposed = false
    const headings = bots.map(() => 0)

    const frame = () => {
      if (disposed) return
      raf = requestAnimationFrame(frame)
      const dt = Math.min(clock.getDelta(), 0.05)
      if (playingRef.current) tickF += (dt / TICK_SECONDS) * speedRef.current
      if (tickF > ticks - 1 + 2.6) tickF = 0
      const dTick = Math.max(0, Math.min(Math.floor(tickF), ticks - 1))
      const frac = smoother(Math.max(0, Math.min(tickF - dTick, 1)))
      const time = clock.elapsedTime
      const isPlaying = playingRef.current // freeze ALL motion (legs, wheels, rotors, hover) on pause

      plan.robots.forEach((r, i) => {
        const b = bots[i], tl = r.timeline
        // A mobile ARM is a fixed factory cell (think a Tesla line arm): it stays bolted in
        // place and articulates to do its work — it never drives around the floor.
        if (botEmb[i] === 'arm') {
          const s = r.start ?? { x: 0, y: 0 }
          b.group.position.set(wx(s.x), b.fly, wz(s.y))
          if (isPlaying) b.group.rotation.y = Math.sin(time * 0.8) * 0.45 // sweep in place
          b.cargo.visible = r.carryingAt[Math.min(dTick, r.carryingAt.length - 1)] ?? false
          return
        }
        const a = tl[Math.min(dTick, tl.length - 1)] ?? r.start
        const nx = tl[Math.min(dTick + 1, tl.length - 1)] ?? a
        const ax = wx(a.x), az = wz(a.y), bx = wx(nx.x), bz = wz(nx.y)
        const px = ax + (bx - ax) * frac, pz = az + (bz - az) * frac
        const moving = (bx !== ax || bz !== az) && isPlaying
        const gait = b.legs.length && moving ? Math.abs(Math.sin(time * 7)) * 0.05 : 0
        const hover = b.fly && isPlaying ? Math.sin(time * 2 + i) * 0.06 : 0
        b.group.position.set(px, b.fly + gait + hover, pz)
        if (moving) {
          const target = Math.atan2(bx - ax, bz - az)
          let diff = target - headings[i]
          while (diff > Math.PI) diff -= Math.PI * 2
          while (diff < -Math.PI) diff += Math.PI * 2
          headings[i] += diff * Math.min(1, dt * 10); b.group.rotation.y = headings[i]
        }
        const carrying = r.carryingAt[Math.min(dTick, r.carryingAt.length - 1)] ?? false
        b.cargo.visible = carrying
        if (isPlaying) b.rotors.forEach((rt) => { rt.rotation.y += dt * 34 })
        if (moving) b.wheels.forEach((w) => { w.rotation.x += dt * 7 * speedRef.current })
        b.legs.forEach((lg, li) => { lg.rotation.x = moving ? Math.sin(time * 7 + li * Math.PI) * 0.5 : 0 })
      })
      itemBoxes.forEach((b) => { b.mesh.visible = dTick < b.pickTick })
      delivered.forEach((dv) => { dv.mesh.visible = dTick >= dv.tick })

      // progress: overall run fraction + "N of M delivered" so the eye can read completion
      const totalDeliv = delivered.length
      let doneDeliv = 0
      for (const dv of delivered) if (dTick >= dv.tick) doneDeliv += 1
      const runPct = ticks > 1 ? Math.min(1, tickF / (ticks - 1)) : 1
      if (progFillRef.current) {
        progFillRef.current.style.width = `${(runPct * 100).toFixed(1)}%`
        progFillRef.current.classList.toggle('done', totalDeliv > 0 && doneDeliv >= totalDeliv)
      }
      if (progTxtRef.current) {
        progTxtRef.current.textContent = totalDeliv === 0
          ? 'no deliveries in this plan'
          : doneDeliv >= totalDeliv
            ? `✓ all ${totalDeliv} delivered`
            : `${doneDeliv} of ${totalDeliv} delivered`
      }

      controls.update(); renderer.render(scene, camera)
    }
    raf = requestAnimationFrame(frame)

    const onResize = () => {
      const w = mount.clientWidth || w0, h = mount.clientHeight || h0
      camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h)
    }
    const ro = new ResizeObserver(onResize); ro.observe(mount)

    return () => {
      disposed = true; cancelAnimationFrame(raf); ro.disconnect(); controls.dispose(); renderer.dispose()
      scene.traverse((o) => {
        const m = o as THREE.Mesh
        if (m.geometry) m.geometry.dispose()
        const mat = (m as THREE.Mesh).material
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose()); else if (mat) (mat as THREE.Material).dispose()
      })
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement)
    }
  }, [siteMap, plan, robotFleet, fleetEmbs, emb, domain, webglOK])

  const togglePlay = () => { const v = !playing; setPlaying(v); playingRef.current = v }
  const bumpSpeed = () => { const v = speed >= 2 ? 1 : speed + 0.5; setSpeed(v); speedRef.current = v }

  if (!webglOK) return <div className="pg3d-fallback">This browser can’t open a 3D (WebGL) view — use the 2D toggle.</div>

  return (
    <div className="pg3d">
      <div className="pg3d-canvas" ref={mountRef} />
      {/* Transport sits directly above the progress bar; Play is the clear primary. */}
      <div className="pg3d-controls">
        <button className="pg3d-btn primary" onClick={togglePlay} aria-label={playing ? 'Pause the animation' : 'Play the animation'}>{playing ? '❚❚ Pause' : '▶ Play'}</button>
        <button className="pg3d-btn" onClick={bumpSpeed} aria-label="Change playback speed">{speed}× speed</button>
      </div>
      <div className="pg3d-progress">
        <div className="pg3d-prog-track"><div className="pg3d-prog-fill" ref={progFillRef} /></div>
        <span className="pg3d-prog-txt" ref={progTxtRef}>starting…</span>
      </div>
      <div className="pg3d-legend">
        <span><i className="lg-box" /> cargo</span>
        <span><i className="lg-rack" /> {DOMAIN_STRUCT_LABEL[domain] ?? 'structure'}</span>
        <span><i className="lg-haz" /> hazard</span>
        <span><i className="lg-hum" /> human-only</span>
        <span className="pg3d-note">Same deterministic plan as 2D — robots pick up, carry, stack on the drop, and return home.</span>
      </div>
    </div>
  )
}
