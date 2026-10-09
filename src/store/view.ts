import { create } from "zustand"
import { dayOf } from "@/lib/dates"

export type Tool = "select" | "hand" | "note" | "connect"
export type StudioView = "timeline" | "journey"

export const RANGE_PRESETS = [
  { id: "vigencia", label: "2025–2028 · Vigência e continuidade", from: 2025, to: 2028 },
  { id: "historico", label: "2023–2027 · Histórico dos Projetos 1 e 2", from: 2023, to: 2027 },
  { id: "panorama", label: "2023–2030 · Panorama estratégico", from: 2023, to: 2030 },
] as const

export const ZOOM_PRESETS = {
  anual: { label: "Anual", pxPerDay: 300 / 365 },
  trimestral: { label: "Trimestral", pxPerDay: 240 / 91 },
  mensal: { label: "Mensal", pxPerDay: 220 / 30.4 },
  semanal: { label: "Semanal", pxPerDay: 150 / 7 },
} as const

export const MIN_PPD = 0.12
export const MAX_PPD = 60

interface ViewState {
  /** Fractional day number at the left edge of the time area. */
  x0: number
  pxPerDay: number
  scrollY: number
  /** Width of the time area in px, reported by the canvas. */
  width: number
  tool: Tool
  connectFrom: string | null
  projectFilter: string[]
  showLinks: boolean
  showAnnotations: boolean
  showTrace: boolean
  studioView: StudioView
  detailAll: boolean
  sidebarOpen: boolean
  indicatorsOpen: boolean
  /** Year range last applied from the header (null after free zoom/pan). */
  range: { from: number; to: number } | null
  setRange: (from: number, to: number) => void
  set: (p: Partial<ViewState>) => void
  zoomAt: (factor: number, anchorPx?: number) => void
  setZoom: (ppd: number) => void
  fit: (start: number, end: number) => void
  centerOn: (start: number, end: number) => void
}

/** Never show more than ~12 years: periods must stay readable. */
const clampPpd = (v: number, width = 1000) => Math.min(MAX_PPD, Math.max(MIN_PPD, width / (12 * 365), v))

export const useView = create<ViewState>((set, get) => ({
  x0: dayOf(2022, 10, 1),
  pxPerDay: 300 / 365,
  scrollY: 0,
  width: 1000,
  tool: "select",
  connectFrom: null,
  projectFilter: [],
  showLinks: false,
  showAnnotations: true,
  showTrace: false,
  studioView: "timeline",
  detailAll: false,
  sidebarOpen: true,
  indicatorsOpen: false,
  range: { from: 2025, to: 2028 },
  setRange: (from, to) => {
    set({ range: { from, to } })
    get().fit(dayOf(from, 1), dayOf(to + 1, 1))
  },
  set: (p) => set(p),
  zoomAt: (factor, anchorPx) => {
    const { x0, pxPerDay, width } = get()
    const a = anchorPx ?? width / 2
    const anchorDay = x0 + a / pxPerDay
    const next = clampPpd(pxPerDay * factor, width)
    // Keep the date under the cursor fixed: zoom never shifts alignment.
    set({ pxPerDay: next, x0: anchorDay - a / next })
  },
  setZoom: (ppd) => get().zoomAt(ppd / get().pxPerDay),
  fit: (start, end) => {
    const w = get().width
    const pad = (end - start) * 0.006
    const ppd = clampPpd(w / (end - start + pad * 2), w)
    set({ pxPerDay: ppd, x0: start - pad })
  },
  centerOn: (start, end) => {
    const { width, pxPerDay } = get()
    let ppd = pxPerDay
    if ((end - start) * ppd > width * 0.9) ppd = clampPpd((width * 0.7) / (end - start), width)
    set({ pxPerDay: ppd, x0: (start + end) / 2 - width / 2 / ppd })
  },
}))
