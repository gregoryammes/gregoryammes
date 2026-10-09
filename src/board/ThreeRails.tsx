import { useEffect, useRef } from "react"
import * as THREE from "three"

export interface RailSpan {
  id: string
  start: number // fractional year
  end: number
  color: string
  hypothesis: boolean
  level: number
}

/**
 * Ambient depth for Scene 1: the cycles as platforms on a temporal rail, with the vigência end as a
 * lit gate. It is a presentation layer only — every date the audience reads is drawn in 2D on top,
 * on a linear scale; the perspective here never carries a measurement.
 */
export function ThreeRails({ spans, gate, focus, from, to }: { spans: RailSpan[]; gate: number | null; focus: string | null; from: number; to: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const state = useRef<{ meshes: Map<string, THREE.Mesh>; focus: string | null }>({ meshes: new Map(), focus: null })
  state.current.focus = focus

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    } catch {
      return // no WebGL: the 2D scene is complete on its own
    }
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const W = canvas.clientWidth || 1920
    const H = canvas.clientHeight || 700
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio))
    renderer.setSize(W, H, false)
    renderer.setClearColor(0x000000, 0)
    const scene = new THREE.Scene()
    scene.fog = new THREE.Fog(0x050b1f, 16, 40)
    const camera = new THREE.PerspectiveCamera(30, W / H, 0.1, 200)
    const mid = (from + to) / 2
    const X = (y: number) => (y - mid) * 2.6

    const railMat = new THREE.LineBasicMaterial({ color: 0x2c5bd8, transparent: true, opacity: 0.5 })
    for (const z of [-1.1, 1.1]) {
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(X(from - 0.6), 0, z), new THREE.Vector3(X(to + 0.6), 0, z)]), railMat))
    }
    const tickMat = new THREE.LineBasicMaterial({ color: 0x1d3a7a, transparent: true, opacity: 0.8 })
    for (let y = Math.ceil(from); y <= to; y++) {
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(X(y), 0, -1.4), new THREE.Vector3(X(y), 0, 1.4)]), tickMat))
    }
    const meshes = new Map<string, THREE.Mesh>()
    for (const s of spans) {
      const color = new THREE.Color(s.color)
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(Math.max(0.1, X(s.end) - X(s.start) - 0.06), 0.09, 1.5),
        new THREE.MeshStandardMaterial({ color, transparent: true, opacity: s.hypothesis ? 0.28 : 0.85, metalness: 0.2, roughness: 0.45, emissive: color, emissiveIntensity: 0.22 }),
      )
      m.position.set((X(s.start) + X(s.end)) / 2, 0.08 + s.level * 0.3, 0)
      if (s.hypothesis) {
        const edges = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry), new THREE.LineDashedMaterial({ color, dashSize: 0.12, gapSize: 0.08 }))
        edges.computeLineDistances()
        m.add(edges)
      }
      scene.add(m)
      meshes.set(s.id, m)
    }
    state.current.meshes = meshes
    let glow: THREE.PointLight | null = null
    if (gate != null) {
      const g = new THREE.Mesh(new THREE.PlaneGeometry(0.035, 2.4), new THREE.MeshBasicMaterial({ color: 0xff7a1a }))
      g.position.set(X(gate), 1.1, 0)
      g.rotation.y = Math.PI / 2
      scene.add(g)
      glow = new THREE.PointLight(0xff7a1a, 6, 6)
      glow.position.set(X(gate), 1.2, 0.6)
      scene.add(glow)
    }
    scene.add(new THREE.AmbientLight(0x6f86c9, 0.8))
    const d = new THREE.DirectionalLight(0xffffff, 1.1)
    d.position.set(4, 8, 6)
    scene.add(d)
    camera.position.set(0, 5.2, 14)
    camera.lookAt(0, 0.4, 0)

    let raf = 0
    let t = 0
    const loop = () => {
      raf = requestAnimationFrame(loop)
      t += 0.0035
      if (!reduce) {
        camera.position.x = Math.sin(t) * 1.2
        camera.lookAt(0, 0.4, 0)
        if (glow) glow.intensity = 5 + Math.sin(t * 6) * 1.2
      }
      const f = state.current.focus
      for (const [id, m] of meshes) {
        const mat = m.material as THREE.MeshStandardMaterial
        const target = !f || f === id ? 1 : 0.25
        mat.emissiveIntensity += ((f === id ? 0.55 : 0.22) - mat.emissiveIntensity) * 0.08
        m.scale.y += ((f === id ? 1.8 : 1) - m.scale.y) * 0.08
        ;(m.userData.o ??= mat.opacity)
        mat.opacity += (m.userData.o * target - mat.opacity) * 0.08
      }
      renderer.render(scene, camera)
    }
    loop()
    return () => {
      cancelAnimationFrame(raf)
      renderer.dispose()
      scene.traverse((o) => {
        const m = o as THREE.Mesh
        m.geometry?.dispose()
        const mat = m.material as THREE.Material | undefined
        mat?.dispose?.()
      })
    }
  }, [JSON.stringify(spans), gate, from, to])

  return <canvas ref={ref} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true" />
}
