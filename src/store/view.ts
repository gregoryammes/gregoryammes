import { create } from "zustand"
import { dayOf } from "@/lib/dates"
import type { FinFilter } from "@/lib/finance"

export type Tool = "select" | "hand" | "note" | "connect" | "quadrant"
export type StudioView = "timeline" | "journey" | "twotimes" | "projeto3"
/** modalities = V11 (padrão) · projects = só projetos · courses/details = hierarquia V8 · all/filtered = matriz V6. */
export type DisplayMode = "modalities" | "projects" | "courses" | "details" | "all" | "filtered"
export type PanelTab = "conteudo" | "design" | "dados"
export type JourneyMode = "conceitual" | "turma" | "matriz"

export const RANGE_PRESETS = [
  { id: "historico", label: "Histórico · 2023–2025", from: 2023, to: 2025 },
  { id: "ciclo", label: "Ciclo atual · 2025–2028", from: 2025, to: 2028 },
  { id: "panorama", label: "Panorama · 2023–2030", from: 2023, to: 2030 },
] as const

export const ZOOM_PRESETS = {
  // Ruler levels: < 120 px/ano → só anos; 120–150 → anos e semestres; ≥ 150 → anos, semestres e meses.
  anual: { label: "Anos", pxPerDay: 84 / 365 },
  semestral: { label: "Semestres", pxPerDay: 130 / 365 },
  trimestral: { label: "Trimestres", pxPerDay: 240 / 91 },
  mensal: { label: "Meses", pxPerDay: 220 / 30.4 },
  semanal: { label: "Semanas", pxPerDay: 150 / 7 },
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
  /** What the timeline shows. Visibility only: never edits, archives or unlinks records. */
  displayMode: DisplayMode
  hiddenProjects: string[]
  turmaFilter: string[]
  turmaFilterMode: "dim" | "hide"
  /** V8 hierarchy: actions expanded at level 2 / collapsed at level 3, collapsed project sections. */
  expanded: string[]
  collapsedActions: string[]
  collapsedProjects: string[]
  /** Projects whose ended-and-paid actions are hidden (open commitments stay visible). */
  hideSettled: string[]
  finFilter: FinFilter
  toggleAction: (key: string) => void
  /** V11 */
  collapsedModalities: string[]
  showFinance: boolean
  showSummary: boolean
  panelTab: PanelTab
  /** Rows of the current timeline layout (key + title), published by the canvas for the quadrant panel. */
  rowIndex: { key: string; title: string }[]
  /** Requested step of the "Explicar vigência" walkthrough (consumed by Dois Tempos). */
  explain: number
  journeyMode: JourneyMode
  journeyTurma: string | null
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

const VIEW_KEY = "ska-temporal-studio:view"
const PERSISTED = ["collapsedModalities", "showFinance", "showSummary", "panelTab", "expanded", "collapsedActions", "collapsedProjects", "hideSettled", "finFilter", "displayMode", "hiddenProjects", "turmaFilter", "turmaFilterMode", "journeyMode", "journeyTurma", "detailAll", "sidebarOpen"] as const
function loadView(): Partial<ViewState> {
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(VIEW_KEY) : null
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

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
  displayMode: "modalities",
  // Macro view: only the three formation lines open by default.
  collapsedModalities: ["bolsas", "operacao", "outras"],
  showFinance: false,
  showSummary: true,
  panelTab: "conteudo",
  rowIndex: [],
  explain: 0,
  expanded: [],
  collapsedActions: [],
  collapsedProjects: [],
  hideSettled: [],
  finFilter: "all",
  toggleAction: (key) => {
    const v = get()
    if (v.displayMode === "details") set({ collapsedActions: v.collapsedActions.includes(key) ? v.collapsedActions.filter((k) => k !== key) : [...v.collapsedActions, key] })
    else set({ expanded: v.expanded.includes(key) ? v.expanded.filter((k) => k !== key) : [...v.expanded, key], ...(v.displayMode === "projects" ? { displayMode: "courses" as const } : {}) })
  },
  hiddenProjects: [],
  turmaFilter: [],
  turmaFilterMode: "dim",
  journeyMode: "conceitual",
  journeyTurma: null,
  detailAll: false,
  sidebarOpen: true,
  indicatorsOpen: false,
  range: { from: 2023, to: 2030 },
  setRange: (from, to) => {
    set({ range: { from, to } })
    get().fit(dayOf(from, 1), dayOf(to + 1, 1))
  },
  ...loadView(),
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

// View preferences are per viewer and survive a reload; they never touch the records.
if (typeof window !== "undefined") {
  useView.subscribe((v, prev) => {
    if (PERSISTED.every((k) => v[k] === prev[k])) return
    try {
      window.localStorage.setItem(VIEW_KEY, JSON.stringify(Object.fromEntries(PERSISTED.map((k) => [k, v[k]]))))
    } catch {
      /* storage unavailable */
    }
  })
}

// Test hook (dev builds only), like `window.__studio`.
if (import.meta.env.DEV && typeof window !== "undefined") (window as unknown as { __view: typeof useView }).__view = useView
