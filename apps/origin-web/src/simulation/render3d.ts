// render3d — a Three.js view of the SAME deterministic sim frames. Warehouse floor, pod-rack
// shelves, outbound docks, robot bots (colour + carried pod), and the human (people-first),
// with a gentle drag-to-orbit camera. Three.js is MIT (installed via npm; see PRIOR_ART.md).
// The 2D and 3D views are two renderings of one verified run — the sim is the source of truth.
import * as THREE from 'three'
import type { SimScene, SimResult, SimFrame } from './warehouseSim'

const COL = { floor: 0xeef2f8, line: 0xc3cee0, shelf: 0xd0daea, dock: 0x0f9d6e, human: 0xe5484d, bg: 0xf6f8fc }

export class Warehouse3DRenderer {
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera: THREE.PerspectiveCamera
  private robotMeshes = new Map<string, { body: THREE.Mesh; pod: THREE.Mesh }>()
  private human?: THREE.Mesh
  private group = new THREE.Group()
  private theta = -Math.PI / 4
  private phi = Math.PI / 3.4
  private dist = 24
  private dragging = false
  private lastX = 0
  private lastY = 0
  private ro?: ResizeObserver
  private container: HTMLElement
  private onDown: (e: PointerEvent) => void
  private onMove: (e: PointerEvent) => void
  private onUp: () => void
  private onWheel: (e: WheelEvent) => void

  constructor(container: HTMLElement) {
    this.container = container
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    this.renderer.setPixelRatio(Math.min(2, typeof window !== 'undefined' ? window.devicePixelRatio : 1))
    this.scene.background = new THREE.Color(COL.bg)
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 500)
    this.scene.add(this.group)

    const amb = new THREE.AmbientLight(0xffffff, 0.75)
    const dir = new THREE.DirectionalLight(0xffffff, 0.9)
    dir.position.set(10, 20, 8)
    this.scene.add(amb, dir)

    container.appendChild(this.renderer.domElement)
    this.renderer.domElement.style.width = '100%'
    this.renderer.domElement.style.height = '100%'
    this.renderer.domElement.style.touchAction = 'none'
    this.renderer.domElement.style.cursor = 'grab'

    this.onDown = (e) => { this.dragging = true; this.lastX = e.clientX; this.lastY = e.clientY; this.renderer.domElement.style.cursor = 'grabbing' }
    this.onMove = (e) => {
      if (!this.dragging) return
      this.theta -= (e.clientX - this.lastX) * 0.008
      this.phi = Math.max(0.4, Math.min(1.4, this.phi - (e.clientY - this.lastY) * 0.006))
      this.lastX = e.clientX
      this.lastY = e.clientY
      this.updateCamera()
    }
    this.onUp = () => { this.dragging = false; this.renderer.domElement.style.cursor = 'grab' }
    this.onWheel = (e) => { e.preventDefault(); this.dist = Math.max(10, Math.min(60, this.dist + e.deltaY * 0.02)); this.updateCamera() }
    this.renderer.domElement.addEventListener('pointerdown', this.onDown)
    window.addEventListener('pointermove', this.onMove)
    window.addEventListener('pointerup', this.onUp)
    this.renderer.domElement.addEventListener('wheel', this.onWheel, { passive: false })

    this.ro = new ResizeObserver(() => this.resize())
    this.ro.observe(container)
    this.resize()
  }

  private resize() {
    const w = this.container.clientWidth || 640
    const h = this.container.clientHeight || 420
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.updateCamera()
  }

  private updateCamera() {
    const r = this.dist
    this.camera.position.set(r * Math.sin(this.phi) * Math.cos(this.theta), r * Math.cos(this.phi), r * Math.sin(this.phi) * Math.sin(this.theta))
    this.camera.lookAt(0, 0, 0)
  }

  build(scene: SimScene) {
    this.group.clear()
    this.robotMeshes.clear()
    this.dist = Math.max(16, Math.max(scene.width, scene.height) * 1.7)
    this.updateCamera()

    // floor
    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(scene.width, 0.4, scene.height),
      new THREE.MeshLambertMaterial({ color: COL.floor }),
    )
    floor.position.set(0, -0.2, 0)
    this.group.add(floor)
    const grid = new THREE.GridHelper(Math.max(scene.width, scene.height), Math.max(scene.width, scene.height), COL.line, COL.line)
    ;(grid.material as THREE.Material).opacity = 0.5
    ;(grid.material as THREE.Material).transparent = true
    grid.position.y = 0.01
    this.group.add(grid)

    const gx = (x: number) => x - scene.width / 2 + 0.5
    const gz = (y: number) => y - scene.height / 2 + 0.5

    // shelves (pod racks)
    const shelfGeo = new THREE.BoxGeometry(0.86, 1.4, 0.86)
    const shelfMat = new THREE.MeshLambertMaterial({ color: COL.shelf })
    for (const s of scene.shelves) {
      const m = new THREE.Mesh(shelfGeo, shelfMat)
      m.position.set(gx(s.x), 0.7, gz(s.y))
      this.group.add(m)
    }
    // docks
    const dockMat = new THREE.MeshLambertMaterial({ color: COL.dock, transparent: true, opacity: 0.35 })
    for (const r of scene.robots) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.08, 0.92), dockMat)
      m.position.set(gx(r.task.drop.x), 0.05, gz(r.task.drop.y))
      this.group.add(m)
    }
    // robots
    for (const r of scene.robots) {
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.36, 20), new THREE.MeshLambertMaterial({ color: new THREE.Color(r.color) }))
      const pod = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), new THREE.MeshLambertMaterial({ color: 0xffffff }))
      pod.position.y = 0.4
      pod.visible = false
      const rg = new THREE.Group()
      rg.add(body, pod)
      rg.position.set(gx(r.task.start.x), 0.18, gz(r.task.start.y))
      this.group.add(rg)
      this.robotMeshes.set(r.id, { body: rg as unknown as THREE.Mesh, pod })
    }
    // human
    const human = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.5, 4, 12), new THREE.MeshLambertMaterial({ color: COL.human }))
    human.position.set(0, 0.5, 0)
    this.human = human
    this.group.add(human)
  }

  update(scene: SimScene, result: SimResult, frameIdx: number) {
    const frame: SimFrame = result.frames[Math.max(0, Math.min(frameIdx, result.frames.length - 1))]
    const gx = (x: number) => x - scene.width / 2 + 0.5
    const gz = (y: number) => y - scene.height / 2 + 0.5
    for (const rs of frame.robots) {
      const m = this.robotMeshes.get(rs.id)
      if (!m) continue
      const g = m.body as unknown as THREE.Group
      g.position.x += (gx(rs.pos.x) - g.position.x) * 0.35 // smooth toward target
      g.position.z += (gz(rs.pos.y) - g.position.z) * 0.35
      m.pod.visible = rs.carrying && !rs.done
      g.visible = true
    }
    if (this.human) {
      this.human.position.x += (gx(frame.human.x) - this.human.position.x) * 0.35
      this.human.position.z += (gz(frame.human.y) - this.human.position.z) * 0.35
    }
    this.renderer.render(this.scene, this.camera)
  }

  dispose() {
    this.ro?.disconnect()
    window.removeEventListener('pointermove', this.onMove)
    window.removeEventListener('pointerup', this.onUp)
    this.renderer.domElement.removeEventListener('pointerdown', this.onDown)
    this.renderer.domElement.removeEventListener('wheel', this.onWheel)
    this.renderer.dispose()
    if (this.renderer.domElement.parentElement === this.container) this.container.removeChild(this.renderer.domElement)
  }
}
