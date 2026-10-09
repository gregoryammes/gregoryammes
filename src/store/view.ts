import { create } from "zustand"
import { dayOf } from "@/lib/dates"

export type Tool = "select" | "hand" | "note" | "connect"

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
  set: (p: Partial<ViewState>) => void
  zoomAt: (factor: number, anchorPx?: number) => void
  setZoom: (ppd: number) => void
  fit: (start: number, end: number) => void
  centerOn: (start: number, end: number) => void
}

const clampPpd = (v: number) => Math.min(MAX_PPD, Math.max(MIN_PPD, v))

export const useView = create<ViewState>((set, get) => ({
  x0: dayOf(2022, 10, 1),
  pxPerDay: 300 / 365,
  scrollY: 0,
  width: 1000,
  tool: "select",
  connectFrom: null,
  projectFilter: [],
  showLinks: true,
  showAnnotations: true,
  showTrace: false,
  set: (p) => set(p),
  zoomAt: (factor, anchorPx) => {
    const { x0, pxPerDay, width } = get()
    const a = anchorPx ?? width / 2
    const anchorDay = x0 + a / pxPerDay
    const next = clampPpd(pxPerDay * factor)
    // Keep the date under the cursor fixed: zoom never shifts alignment.
    set({ pxPerDay: next, x0: anchorDay - a / next })
  },
  setZoom: (ppd) => get().zoomAt(ppd / get().pxPerDay),
  fit: (start, end) => {
    const w = get().width
    const pad = (end - start) * 0.04 + 10
    const ppd = clampPpd(w / (end - start + pad * 2))
    set({ pxPerDay: ppd, x0: start - pad })
  },
  centerOn: (start, end) => {
    const { width, pxPerDay } = get()
    let ppd = pxPerDay
    if ((end - start) * ppd > width * 0.9) ppd = clampPpd((width * 0.7) / (end - start))
    set({ pxPerDay: ppd, x0: (start + end) / 2 - width / 2 / ppd })
  },
}))
