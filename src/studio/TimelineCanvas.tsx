import { useEffect, useMemo, useRef, useState } from "react"
import {
  addMonths, calendarMonthsTouched, dayOf, fmtDate, fmtMonthsSpan, fromDay, lengthDays, monthShort, partAfter, snapBoundary, toDay, ymd,
  type DayRange,
} from "@/lib/dates"
import type { EffItem } from "@/lib/analysis"
import { computeRows, BAR_H, COMP_LABEL, LABEL_W, SUB_H, type Drop, type Row } from "@/lib/layout"
import { computeHierarchy } from "@/lib/hierarchy"
import { computeModalities, LANE_H } from "@/lib/modalities"
import { acqWarnings, finRange, finRecordsIn, paidOf, type Tag } from "@/lib/finance"
import { C, barStyleFor, itemColor, statusOf, textWidth, truncate, wrapText, type StatusKey } from "@/lib/visual"
import { reorderRows, useStudio, uid, writeVisual } from "@/store/store"
import { useCompareItems, useEffectiveItems, useProjectColor } from "@/store/hooks"
import { useView } from "@/store/view"
import { ACQ_STATUS_LABEL, FIN_KIND_LABEL, FIN_LABEL, GROUPS, KIND_LABEL, MODALITIES, PARCEL_LABEL, PROOF_LABEL, type Annotation, type FinRecord, type GroupId, type ModalityId, type StudioDoc } from "@/data/types"
import { FinanceColumn, FIN_COL_W } from "./FinanceColumn"
import { BlockMenu, InlineLabel } from "./CanvasOverlays"
import { docVigRange, offeringLabel, relatedToTurmas, shortNameOf, TEMPORAL_LABEL, temporalSituation, turmasOf } from "@/lib/v6"
import { confirmAction } from "@/components/Confirm"

/* ──────────────────────────────────────────────────────────────────────────────
 * Timeline — a continuous time matrix. Rows are records, grouped in four reading
 * groups; x is computed from real calendar days only (dates are the source of truth).
 * ────────────────────────────────────────────────────────────────────────────── */

const PROJ_H = 40
const YEAR_H = 26
const SEM_H = 22
const MONTH_H = 18
const EXTENT_START = dayOf(2022, 1)
const EXTENT_END = dayOf(2032, 1)

const GROUP_COLOR: Record<GroupId, string> = { g1: C.navy, g2: C.green, g3: C.blue, g4: "#6B5B4E" }

type Gesture =
  | {
      type: "move"
      anchor: string
      ids: string[]
      sx: number
      sy: number
      orig: Record<string, { start: number; end: number }>
      began: boolean
      temporalReady: boolean
      clickSelect: string | null
      drop: Drop | null
    }
  | { type: "resize-l" | "resize-r"; id: string; sx: number; orig: { start: number; end: number }; began: boolean }
  | { type: "pan"; sx: number; sy: number; x0: number; scrollY: number; moved: boolean }
  | { type: "marquee"; sx: number; sy: number; cx: number; cy: number; additive: boolean }
  | { type: "ann"; id: string; sx: number; sy: number; date: number; y: number; offset: number; linked: boolean; began: boolean }
  | { type: "hscroll"; sx: number; x0: number }

const shortMonth = (day: number) => {
  const t = ymd(day)
  return `${monthShort(t.m)}/${String(t.y).slice(2)}`
}

export function TimelineCanvas() {
  const items = useEffectiveItems()
  const compare = useCompareItems()
  const doc = useStudio((s) => s.doc)
  const selection = useStudio((s) => s.selection)
  const selectedAnnotation = useStudio((s) => s.selectedAnnotation)
  const selectedFin = useStudio((s) => s.selectedFin)
  const scenarioId = useStudio((s) => s.scenarioId)
  const view = useView()
  const colorOf = useProjectColor()
  const wrapRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const gesture = useRef<Gesture | null>(null)
  const [rawSize, setSize] = useState({ w: 1200, h: 600 })
  // Optional financial columns on the right: the time area gives up that width.
  const finW = view.showFinance ? FIN_COL_W : 0
  const size = { w: rawSize.w - finW, h: rawSize.h }
  const [inline, setInline] = useState<{ id: string; x: number; y: number; w: number; h: number } | null>(null)
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null)
  const downHit = useRef<{ kind?: string; id: string }>({ id: "" })
  const [, force] = useState(0)
  const [hover, setHover] = useState<{ id: string; x: number; y: number; hyp?: boolean } | null>(null)
  const [dragHint, setDragHint] = useState<{ x: number; y: number; lines: string[] } | null>(null)
  const [spaceDown, setSpaceDown] = useState(false)
  const fitted = useRef(false)

  const { settings } = doc
  const { displayMode, hiddenProjects, turmaFilter, turmaFilterMode } = view
  const hier = displayMode === "courses" || displayMode === "details" || displayMode === "modalities"
  const refDay = toDay(settings.referenceDate)
  const fins = useMemo(() => finRecordsIn(doc, scenarioId), [doc, scenarioId])
  // Visibility filters only decide what is drawn: records, links and scenarios are untouched.
  const visible = useMemo(
    () =>
      items.filter((i) => {
        if (i.hidden) return false
        // In the hierarchy, project visibility is resolved per action (shared actions stay visible).
        if (!hier && i.projectId && hiddenProjects.includes(i.projectId)) return false
        if (displayMode === "filtered" && i.kind === "projeto") return false
        const related = relatedToTurmas(doc, i, turmaFilter) || i.kind === "vigencia"
        if (turmaFilter.length && (displayMode === "filtered" || turmaFilterMode === "hide") && !related && i.kind !== "projeto") return false
        return true
      }),
    [items, hiddenProjects, displayMode, turmaFilter, turmaFilterMode, doc, hier],
  )
  const layout = useMemo(
    () =>
      displayMode === "modalities"
        ? computeModalities({
            doc,
            items: visible,
            fins,
            ref: refDay,
            expanded: view.expanded,
            collapsedModalities: view.collapsedModalities,
            hiddenProjects,
            hideSettled: view.hideSettled,
            finFilter: view.finFilter,
            consolidations: doc.consolidations,
            detailAll: view.detailAll,
          })
        : hier
        ? computeHierarchy({
            doc,
            items: visible,
            fins,
            ref: refDay,
            level: displayMode === "details" ? 3 : 2,
            expanded: view.expanded,
            collapsed: view.collapsedActions,
            collapsedProjects: view.collapsedProjects,
            hiddenProjects,
            hideSettled: view.hideSettled,
            finFilter: view.finFilter,
            consolidations: doc.consolidations,
          })
        : computeRows(visible, {
            hidden: settings.groupsHidden ?? [],
            collapsed: settings.groupsCollapsed ?? [],
            detailed: settings.groupsDetailed ?? [],
            detailAll: view.detailAll,
            portfolio: displayMode === "projects",
            consolidations: doc.consolidations,
          }),
    [visible, settings.groupsHidden, settings.groupsCollapsed, settings.groupsDetailed, view.detailAll, displayMode, doc, hier, fins, refDay, view.expanded, view.collapsedActions, view.collapsedProjects, hiddenProjects, view.hideSettled, view.finFilter, view.collapsedModalities],
  )
  const projects = visible.filter((i) => i.kind === "projeto" && !(i.projectId && hiddenProjects.includes(i.projectId)))
  const allItemRows = layout.itemRows ?? layout.rows.filter((r): r is Extract<Row, { type: "item" }> => r.type === "item")
  const vig = items.find((i) => i.kind === "vigencia" && i.projectId === "p2") ?? items.find((i) => i.kind === "vigencia")
  // The documental marker is read from the baseline records, never from the active scenario.
  const docVig: DayRange | null = docVigRange(doc)
  const hypVig: DayRange | null = vig && docVig && (vig.range.end !== docVig.end || vig.range.start !== docVig.start) ? vig.range : null
  const filter = view.projectFilter
  const dimmed = (it: EffItem) =>
    (filter.length > 0 && !filter.includes(it.projectId ?? "")) ||
    (turmaFilter.length > 0 && turmaFilterMode === "dim" && it.kind !== "vigencia" && it.kind !== "projeto" && !relatedToTurmas(doc, it, turmaFilter))

  // ── Measure; first open shows 2025–2028 ──────────────────────────────────
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => {
      const w = Math.floor(e.contentRect.width)
      const h = Math.floor(e.contentRect.height)
      if (!w || !h) return
      setSize({ w, h })
      useView.getState().set({ width: Math.max(200, w - LABEL_W - (useView.getState().showFinance ? FIN_COL_W : 0)) })
      const r = useView.getState().range
      if (!fitted.current) {
        fitted.current = true
        useView.getState().setRange(r?.from ?? 2025, r?.to ?? 2028)
      } else if (r) useView.getState().fit(dayOf(r.from, 1), dayOf(r.to + 1, 1))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  // Keep the date scale exact when the financial columns open or close.
  useEffect(() => {
    useView.getState().set({ width: Math.max(200, rawSize.w - LABEL_W - finW) })
  }, [finW, rawSize.w])

  const { x0, pxPerDay: ppd, scrollY } = view
  const ppy = ppd * 365.25
  const showSem = ppy >= 90
  // The ruler is always ANO → SEMESTRE → MÊS (quarters are not a reading level here).
  const showQuarters = false
  const showMonths = ppy >= 150
  const HEADER = PROJ_H + YEAR_H + (showSem ? SEM_H : 0) + (showMonths ? MONTH_H : 0) + 4
  const BODY_TOP = HEADER
  const X = (day: number) => LABEL_W + (day - x0) * ppd
  const dayAt = (px: number) => x0 + (px - LABEL_W) / ppd
  const Y = (rowTop: number) => BODY_TOP + rowTop - scrollY
  const visStart = Math.floor(dayAt(LABEL_W)) - 2
  const visEnd = Math.ceil(dayAt(size.w)) + 2
  const bodyH = Math.max(0, size.h - HEADER)
  const maxScroll = Math.max(0, layout.total - bodyH + 60)
  const maxScrollRef = useRef(maxScroll)
  maxScrollRef.current = maxScroll

  // ── Keyboard ────────────────────────────────────────────────────────────
  useEffect(() => {
    const isField = (t: EventTarget | null) => t instanceof HTMLElement && t.closest("input,textarea,select,[contenteditable]") !== null
    const down = (e: KeyboardEvent) => {
      if (isField(e.target) || useStudio.getState().mode !== "studio" || useView.getState().studioView !== "timeline") return
      const st = useStudio.getState()
      const mod = e.metaKey || e.ctrlKey
      const k = e.key.toLowerCase()
      if (e.code === "Space") {
        setSpaceDown(true)
        e.preventDefault()
      } else if (mod && k === "z") {
        e.preventDefault()
        if (e.shiftKey) st.redo()
        else st.undo()
      } else if (mod && k === "y") {
        e.preventDefault()
        st.redo()
      } else if (mod && k === "c") st.copy()
      else if (mod && k === "v") st.paste()
      else if (mod && k === "d") {
        e.preventDefault()
        st.duplicateItems(st.selection)
      } else if (mod && k === "s") {
        e.preventDefault()
        st.save()
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (st.selectedAnnotation) {
          const id = st.selectedAnnotation
          confirmAction("Excluir a anotação selecionada?").then((ok) => ok && st.deleteAnnotation(id))
        } else if (st.selection.length) {
          const ids = st.selection
          confirmAction(`Excluir ${ids.length} elemento(s)? (é possível desfazer)`).then((ok) => ok && st.deleteItems(ids))
        }
      } else if (e.key === "Escape") {
        setMenu(null)
        setInline(null)
        st.select([])
        useView.getState().set({ connectFrom: null, tool: "select" })
      } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        if (!st.selection.length) return
        e.preventDefault()
        nudge(e.key === "ArrowRight" ? 1 : -1, e.shiftKey)
      } else if (!mod && k === "v") useView.getState().set({ tool: "select" })
      else if (!mod && k === "h") useView.getState().set({ tool: "hand" })
      else if (!mod && k === "n") useView.getState().set({ tool: "note" })
      else if (!mod && k === "c") useView.getState().set({ tool: "connect", connectFrom: null })
    }
    const up = (e: KeyboardEvent) => e.code === "Space" && setSpaceDown(false)
    window.addEventListener("keydown", down)
    window.addEventListener("keyup", up)
    return () => {
      window.removeEventListener("keydown", down)
      window.removeEventListener("keyup", up)
    }
  })

  function nudge(dir: number, big: boolean) {
    const st = useStudio.getState()
    const unit = big ? "month" : settings.snap === "none" ? "day" : settings.snap
    const sel = visible.filter((i) => st.selection.includes(i.id) && !i.locked)
    if (!sel.length || !st.prepareEdit(sel[0].id, true)) return
    const patches: Record<string, { start: string; end: string }> = {}
    for (const it of sel) {
      const len = it.range.end - it.range.start
      const ns =
        unit === "day" ? it.range.start + dir
        : unit === "week" ? it.range.start + 7 * dir
        : addMonths(snapBoundary(it.range.start, "month"), (unit === "quarter" ? 3 : 1) * dir)
      patches[it.id] = { start: fromDay(ns), end: fromDay(ns + len - 1) }
    }
    st.begin("deslocar (teclado)")
    st.livePatchItems(patches)
    st.end(`${dir > 0 ? "+" : "−"}1 ${unit}`)
  }

  // ── Wheel: pan; Ctrl/⌘ (or pinch) zooms at the cursor ─────────────────────
  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const v = useView.getState()
      const rect = el.getBoundingClientRect()
      if (e.ctrlKey || e.metaKey || e.altKey) {
        v.zoomAt(Math.exp(-e.deltaY * 0.0022), e.clientX - rect.left - LABEL_W)
        v.set({ range: null })
      } else {
        const dx = e.shiftKey ? e.deltaY : e.deltaX
        const dy = e.shiftKey ? 0 : e.deltaY
        v.set({ x0: v.x0 + dx / v.pxPerDay, scrollY: Math.max(0, Math.min(maxScrollRef.current, v.scrollY + dy)), ...(dx ? { range: null } : {}) })
      }
    }
    el.addEventListener("wheel", onWheel, { passive: false })
    return () => el.removeEventListener("wheel", onWheel)
  }, [])

  // ── Pointer interactions ─────────────────────────────────────────────────
  const local = (e: { clientX: number; clientY: number }) => {
    const r = svgRef.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }
  const bodyY = (y: number) => y - BODY_TOP + scrollY

  function toggleGroup(key: "groupsCollapsed" | "groupsDetailed" | "groupsHidden", g: GroupId) {
    useStudio.getState().commit("grupo", (d) => {
      const cur = (d.settings[key] ?? []) as GroupId[]
      return { ...d, settings: { ...d.settings, [key]: cur.includes(g) ? cur.filter((x) => x !== g) : [...cur, g] } }
    })
  }

  function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    const st = useStudio.getState()
    const v = useView.getState()
    const p = local(e)
    const hit = (e.target as Element).closest<SVGElement>("[data-hit]")
    const kind = hit?.dataset.hit
    const id = hit?.dataset.id ?? ""
    // Selecting may open the properties drawer and shift the canvas: remember what was pressed.
    downHit.current = { kind, id }
    setHover(null)

    if (kind === "g-collapse") return toggleGroup("groupsCollapsed", id as GroupId)
    if (kind === "h-toggle") return v.toggleAction(id)
    if (kind === "p-toggle") return v.set({ collapsedProjects: v.collapsedProjects.includes(id) ? v.collapsedProjects.filter((x) => x !== id) : [...v.collapsedProjects, id] })
    if (kind === "fin") return st.selectFin(id)
    if (kind === "m-collapse") return v.set({ collapsedModalities: v.collapsedModalities.includes(id) ? v.collapsedModalities.filter((x) => x !== id) : [...v.collapsedModalities, id] })
    setMenu(null)
    if (kind === "g-detail") return toggleGroup("groupsDetailed", id as GroupId)
    if (kind === "cons-label") {
      const ids = items.filter((i) => i.consolidation === id).map((i) => i.id)
      st.select(ids)
      return
    }
    if (kind === "label" || kind === "item-static") {
      st.select([id], e.shiftKey || e.metaKey || e.ctrlKey)
      return
    }
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)

    if (e.button === 1 || spaceDown || v.tool === "hand" || (!hit && v.tool === "select" && !e.shiftKey)) {
      gesture.current = { type: "pan", sx: p.x, sy: p.y, x0: v.x0, scrollY: v.scrollY, moved: false }
      return
    }
    if (v.tool === "note") {
      const target = kind?.startsWith("item") ? visible.find((i) => i.id === id) : undefined
      const day = Math.round(dayAt(p.x))
      const row = target && layout.rowOf(target.id)
      const a: Annotation = target && row
        ? { id: uid("ann"), kind: "callout", text: "Nova anotação", date: fromDay(day), y: bodyY(p.y) - row.top - 46, linkedItemId: target.id, offsetDays: day - target.range.start, width: 200 }
        : { id: uid("ann"), kind: "note", text: "Nova anotação", date: fromDay(day), y: bodyY(p.y), width: 200 }
      st.addAnnotation(a)
      v.set({ tool: "select" })
      return
    }
    if (v.tool === "connect") {
      if (kind?.startsWith("item")) {
        if (!v.connectFrom) {
          v.set({ connectFrom: id })
          st.toast("Origem escolhida. Clique no elemento de destino.", "info")
        } else {
          st.addLink({ id: uid("lk"), from: v.connectFrom, to: id })
          v.set({ connectFrom: null, tool: "select", showLinks: true })
        }
      }
      return
    }
    if (kind === "ann") {
      const a = doc.annotations.find((x) => x.id === id)
      if (!a) return
      useStudio.setState({ selectedAnnotation: id, selection: [] })
      gesture.current = { type: "ann", id, sx: p.x, sy: p.y, date: toDay(a.date), y: a.y, offset: a.offsetDays ?? 0, linked: !!a.linkedItemId, began: false }
      return
    }
    if (kind === "item" || kind === "item-l" || kind === "item-r") {
      const it = visible.find((i) => i.id === id)
      if (!it) return
      if (kind !== "item") {
        if (!st.selection.includes(id)) st.select([id])
        gesture.current = { type: kind === "item-l" ? "resize-l" : "resize-r", id, sx: p.x, orig: { ...it.range }, began: false }
        return
      }
      let ids = st.selection
      let clickSelect: string | null = null
      if (e.shiftKey || e.metaKey || e.ctrlKey) {
        st.select([id], true)
        ids = useStudio.getState().selection
        if (!ids.includes(id)) return
      } else if (!ids.includes(id)) {
        st.select([id])
        ids = [id]
      } else clickSelect = id
      const orig: Record<string, { start: number; end: number }> = {}
      for (const i of visible) if (ids.includes(i.id) && !i.locked) orig[i.id] = { start: i.range.start, end: i.range.end }
      gesture.current = { type: "move", anchor: id, ids: Object.keys(orig), sx: p.x, sy: p.y, orig, began: false, temporalReady: false, clickSelect, drop: null }
      return
    }
    gesture.current = { type: "marquee", sx: p.x, sy: p.y, cx: p.x, cy: p.y, additive: e.shiftKey }
  }

  function openInline(id: string) {
    const r = layout.rowOf(id)
    const it = byId.get(id)
    if (!r || !it) return
    const x = Math.max(LABEL_W, X(it.range.start))
    setInline({ id, x, y: Y(r.top) + (r.h - BAR_H) / 2, w: Math.max(180, Math.min(X(it.range.end) - x, 340)), h: BAR_H })
  }

  function showRangeHint(p: { x: number; y: number }, r: DayRange, orig: DayRange) {
    const d = r.start - orig.start
    setDragHint({
      x: p.x,
      y: p.y,
      lines: [
        `${fmtDate(fromDay(r.start))} → ${fmtDate(fromDay(r.end - 1))}`,
        `${lengthDays(r)} dias · ${calendarMonthsTouched(r)} meses-calendário${d ? ` · ${d > 0 ? "+" : ""}${d} d` : ""}`,
      ],
    })
  }

  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    const g = gesture.current
    if (!g) return
    const p = local(e)
    const st = useStudio.getState()
    const snap = settings.snap
    if (g.type === "pan") {
      const dx = p.x - g.sx
      const dy = p.y - g.sy
      if (Math.abs(dx) + Math.abs(dy) > 3) g.moved = true
      useView.getState().set({ x0: g.x0 - dx / ppd, scrollY: Math.max(0, Math.min(maxScroll, g.scrollY - dy)), ...(Math.abs(dx) > 3 ? { range: null } : {}) })
      return
    }
    if (g.type === "marquee") {
      g.cx = p.x
      g.cy = p.y
      force((n) => n + 1)
      return
    }
    if (g.type === "ann") {
      const dd = Math.round((p.x - g.sx) / ppd)
      const dy = p.y - g.sy
      if (!g.began) {
        if (Math.abs(p.x - g.sx) + Math.abs(dy) < 3) return
        st.begin("mover anotação")
        g.began = true
      }
      st.patchAnnotation(g.id, g.linked ? { offsetDays: g.offset + dd, y: g.y + dy } : { date: fromDay(g.date + dd), y: g.y + dy }, true)
      return
    }
    if (g.type === "resize-l" || g.type === "resize-r") {
      const raw = (p.x - g.sx) / ppd
      let start = g.orig.start
      let end = g.orig.end
      if (g.type === "resize-r") end = Math.max(start + 1, snapBoundary(g.orig.end + raw, snap))
      else start = Math.min(end - 1, snapBoundary(g.orig.start + raw, snap))
      if (start === g.orig.start && end === g.orig.end && !g.began) return
      if (!g.began) {
        if (!st.prepareEdit(g.id, true)) {
          gesture.current = null
          return
        }
        st.begin(g.type === "resize-r" ? "redimensionar fim" : "redimensionar início")
        g.began = true
      }
      st.livePatchItems({ [g.id]: { start: fromDay(start), end: fromDay(end - 1) } })
      showRangeHint(p, { start, end }, g.orig)
      return
    }
    if (g.type === "move") {
      const raw = (p.x - g.sx) / ppd
      const anchor = g.orig[g.anchor]
      if (!anchor) return
      const delta = snapBoundary(anchor.start + raw, snap) - anchor.start
      const dy = p.y - g.sy
      const vertical = Math.abs(dy) > 18
      if (!g.began && delta === 0 && !vertical) return
      if (delta !== 0 && !g.temporalReady) {
        if (!st.prepareEdit(g.anchor, true)) {
          gesture.current = null
          return
        }
        g.temporalReady = true
      }
      if (!g.began) {
        st.begin(g.ids.length > 1 ? `mover ${g.ids.length} elementos` : "mover")
        g.began = true
      }
      // Vertical movement only chooses a row/group; it never changes the period.
      g.drop = vertical ? layout.dropAt(bodyY(p.y)) : null
      if (g.temporalReady) {
        const patches: Record<string, { start: string; end: string }> = {}
        for (const id of g.ids) {
          const o = g.orig[id]
          patches[id] = { start: fromDay(o.start + delta), end: fromDay(o.end + delta - 1) }
        }
        st.livePatchItems(patches)
      }
      showRangeHint(p, { start: anchor.start + delta, end: anchor.end + delta }, anchor)
    }
    if (g.type === "hscroll") {
      const span = EXTENT_END - EXTENT_START
      const trackW = size.w - LABEL_W
      useView.getState().set({ x0: g.x0 + ((p.x - g.sx) / trackW) * span, range: null })
    }
  }

  function onPointerUp(e: React.PointerEvent<SVGSVGElement>) {
    const g = gesture.current
    gesture.current = null
    setDragHint(null)
    const st = useStudio.getState()
    try {
      ;(e.currentTarget as Element).releasePointerCapture(e.pointerId)
    } catch {
      /* already released */
    }
    if (!g) return
    if (g.type === "pan") {
      if (!g.moved && !spaceDown && useView.getState().tool === "select") st.select([])
      return
    }
    if (g.type === "marquee") {
      const x1 = Math.min(g.sx, g.cx), x2 = Math.max(g.sx, g.cx)
      const y1 = Math.min(g.sy, g.cy), y2 = Math.max(g.sy, g.cy)
      const d1 = dayAt(x1), d2 = dayAt(x2)
      const hits = allItemRows
        .filter((r) => {
          const top = Y(r.top) + 6, bot = top + r.h - 12
          return r.item.range.end > d1 && r.item.range.start < d2 && bot > y1 && top < y2
        })
      force((n) => n + 1)
      st.select([...new Set(hits.map((h) => h.item.id))], g.additive)
      return
    }
    if (g.type === "move") {
      if (!g.began && g.clickSelect) st.select([g.clickSelect])
      if (g.began) {
        if (g.drop) {
          const drop = g.drop
          // Vertical moves only change the arrangement (modality / lane / row), never the dates.
          if (drop.modality) st.live((d) => writeVisual(d, st.scenarioId, g.anchor, { modality: drop.modality as ModalityId, modLane: drop.index }))
          else st.live((d) => reorderRows(d, st.scenarioId, g.anchor, drop.group, layout.orderOf(drop.group), drop.index))
        }
        const it = visible.find((i) => i.id === g.anchor)
        st.end(it?.name)
      }
      return
    }
    if (g.type === "hscroll") return
    if (g.began) {
      if (g.type === "resize-l" || g.type === "resize-r") {
        const it = visible.find((i) => i.id === g.id)
        st.end(it ? `${fmtDate(it.start)} → ${fmtDate(it.end)}` : undefined)
      } else st.end()
    }
  }

  // ── Ticks ────────────────────────────────────────────────────────────────
  const years: number[] = []
  for (let y = ymd(Math.max(visStart, EXTENT_START - 400)).y; y <= ymd(visEnd).y; y++) years.push(y)
  const yearW = ppy
  const halves: { day: number; label: string; end: number }[] = []
  if (showSem) {
    for (const y of years) {
      if (showQuarters) for (let q = 0; q < 4; q++) halves.push({ day: dayOf(y, q * 3 + 1), end: dayOf(y, q * 3 + 4), label: `${q + 1}º tri` })
      else
        for (const h of [0, 1])
          halves.push({ day: dayOf(y, h * 6 + 1), end: dayOf(y, h * 6 + 7), label: yearW / 2 >= 70 ? `${h + 1}º sem` : `S${h + 1}` })
    }
  }
  const months: { day: number; label: string }[] = []
  if (showMonths) {
    const a = ymd(visStart)
    const mw = ppd * 30.4
    for (let d = dayOf(a.y, a.m); d <= visEnd; d = addMonths(d, 1)) {
      const m = ymd(d).m
      months.push({ day: d, label: mw >= 34 ? monthShort(m) : mw >= 11 ? monthShort(m)[0].toUpperCase() : "" })
    }
  }
  const weeks: number[] = []
  if (ppd >= 5) for (let d = visStart - ((ymd(visStart).dow + 6) % 7); d <= visEnd; d += 7) weeks.push(d)

  // Project bands in the header, packed into sub-lanes so overlaps stay readable.
  const bandLanes: { it: EffItem; lane: number }[] = []
  {
    const ends: number[] = []
    for (const p of [...projects].sort((a, b) => a.range.start - b.range.start)) {
      let lane = ends.findIndex((e) => e <= p.range.start)
      if (lane < 0) lane = ends.length
      ends[lane] = p.range.end
      bandLanes.push({ it: p, lane })
    }
  }
  const bandRows = Math.max(1, Math.min(2, new Set(bandLanes.map((b) => b.lane)).size))
  const bandH = (PROJ_H - 6) / bandRows

  const sel = new Set(selection)
  const compareMap = useMemo(() => new Map((compare ?? []).map((c) => [c.id, c])), [compare])
  const byId = useMemo(() => new Map(visible.map((i) => [i.id, i])), [visible])

  const g = gesture.current
  const marquee = g && g.type === "marquee" ? g : null
  const dropLine = g && g.type === "move" && g.drop ? g.drop : null
  const cursor = spaceDown || view.tool === "hand" ? "grab" : view.tool === "note" ? "copy" : view.tool === "connect" ? "crosshair" : "default"
  const timeW = size.w - LABEL_W

  const hoverItem = hover ? byId.get(hover.id) : undefined

  return (
    <div ref={wrapRef} className="relative h-full w-full overflow-hidden bg-white select-none">
      <svg
        ref={svgRef}
        id="timeline-svg"
        xmlns="http://www.w3.org/2000/svg"
        width={size.w}
        height={size.h}
        style={{ cursor, display: "block", touchAction: "none", fontFamily: "Inter, system-ui, sans-serif" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          useStudio.getState().cancel()
          gesture.current = null
          setDragHint(null)
        }}
        onDoubleClick={() => {
          // Pointer capture retargets click events to the svg, and selecting may shift the canvas:
          // use the block that was pressed, and place the editor from the layout.
          const { kind: k, id } = downHit.current
          if (k === "item" || k === "item-static") openInline(id)
          else if (k === "label") useStudio.getState().setEditing(id || null)
        }}
        onContextMenu={(e) => {
          const { kind: k, id } = downHit.current
          if (!(k === "item" || k === "item-static" || k === "label" || k === "item-l" || k === "item-r")) return
          e.preventDefault()
          if (!useStudio.getState().selection.includes(id)) useStudio.getState().select([id])
          const p = local(e)
          setMenu({ id, x: p.x, y: p.y })
        }}
      >
        <defs>
          <pattern id="stripe-after" patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="8" stroke={C.after} strokeWidth="3" strokeOpacity="0.55" />
          </pattern>
          <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill={C.text2} />
          </marker>
          <clipPath id="clip-body">
            <rect x={LABEL_W} y={BODY_TOP} width={Math.max(0, timeW)} height={bodyH} />
          </clipPath>
          <clipPath id="clip-labels">
            <rect x={0} y={BODY_TOP} width={LABEL_W} height={bodyH} />
          </clipPath>
          <clipPath id="clip-header">
            <rect x={LABEL_W} y={0} width={Math.max(0, timeW)} height={HEADER} />
          </clipPath>
        </defs>

        <rect x={0} y={0} width={size.w} height={size.h} fill="#FFFFFF" />

        {/* ── Body ─────────────────────────────────────────────────────── */}
        <g clipPath="url(#clip-body)">
          {/* After the documental vigência: very light red, never hiding the bars */}
          {docVig && <rect x={X(docVig.end)} y={BODY_TOP} width={Math.max(0, size.w - X(docVig.end))} height={bodyH} fill={C.afterSoft} />}
          {hier && ProjectTints()}
          {layout.rows.map((r, i) =>
            r.type === "heading" ? (
              <rect key={`hd${i}`} x={LABEL_W} y={Y(r.top)} width={timeW} height={r.h} fill="#FFFFFF" fillOpacity={0.85} />
            ) : r.type === "lane" && r.index % 2 === 1 ? (
              <rect key={`lz${i}`} x={LABEL_W} y={Y(r.top)} width={timeW} height={r.h} fill={C.zebra} fillOpacity={0.55} />
            ) : r.type === "group" ? (
              <rect key={`gb${i}`} x={LABEL_W} y={Y(r.top)} width={timeW} height={r.h} fill="#FFFFFF" fillOpacity={0.6} />
            ) : r.type === "project" ? (
              <rect key={`pj${i}`} x={LABEL_W} y={Y(r.top)} width={timeW} height={r.h} fill="#F3F6FA" />
            ) : (r.type === "item" || r.type === "consolidated" || r.type === "comp" || r.type === "note") && r.index % 2 === 1 && !(r.type === "item" && r.virtual) ? (
              <rect key={`z${i}`} x={LABEL_W} y={Y(r.top)} width={timeW} height={r.h} fill={C.zebra} fillOpacity={0.75} />
            ) : null,
          )}
          {/* Grid */}
          {months.map((m, i) => (
            <line key={`gm${i}`} x1={X(m.day)} x2={X(m.day)} y1={BODY_TOP} y2={size.h} stroke={C.gridSoft} />
          ))}
          {halves.map((h, i) => (
            <line key={`gh${i}`} x1={X(h.day)} x2={X(h.day)} y1={BODY_TOP} y2={size.h} stroke={C.grid} strokeDasharray="3 4" />
          ))}
          {years.map((y) => (
            <line key={`gy${y}`} x1={X(dayOf(y, 1))} x2={X(dayOf(y, 1))} y1={BODY_TOP} y2={size.h} stroke="#C9D3DE" />
          ))}

          {/* Compare scenario ghosts */}
          {compare &&
            allItemRows.map((r, i) => {
              if (r.virtual) return null
              const c = compareMap.get(r.item.id)
              if (!c || (c.range.start === r.item.range.start && c.range.end === r.item.range.end)) return null
              return (
                <rect key={`cmp${i}`} x={X(c.range.start)} y={Y(r.top) + (r.h - BAR_H) / 2 - 2} width={Math.max(2, (c.range.end - c.range.start) * ppd)} height={BAR_H + 4} rx={4}
                  fill="none" stroke="#7C5CC4" strokeWidth={1.5} strokeDasharray="3 3" pointerEvents="none" />
              )
            })}

          {layout.rows.map((r, i) => {
            if (r.type === "lane") return <g key={`ln${r.kind}${r.label}${i}`}>{LaneBars({ r })}</g>
            if (r.type === "heading") return null
            if (r.type === "project") return <g key={`pr${r.projectId}${i}`}>{ProjectBar({ r })}</g>
            if (r.type === "comp") return <g key={`cp${r.actionId}${r.comp}${i}`}>{CompBar({ r })}</g>
            if (r.type === "note")
              return <text key={`nt${i}`} x={LABEL_W + 14} y={Y(r.top) + r.h / 2 + 4} fontSize={11.5} fontStyle="italic" fill={r.tone === "warn" ? "#8A5A10" : C.text3} pointerEvents="none">{r.text}</text>
            if (r.type === "consolidated") return <g key={`c${r.key}${i}`}>{ConsolidatedBar({ r })}</g>
            if (r.type !== "item") return null
            if (r.portfolio) return <g key={`pf${r.item.id}`}>{PortfolioBar({ r })}</g>
            return <g key={`${r.item.id}${r.virtual ?? ""}${i}`}>{ItemBar({ r })}</g>
          })}

          {/* Links: only on demand or for the selected record */}
          {doc.links.map((l) => {
            const show = view.showLinks || sel.has(l.from) || sel.has(l.to)
            if (!show) return null
            const a = byId.get(l.from)
            const b = byId.get(l.to)
            const ra = a && layout.rowOf(a.id)
            const rb = b && layout.rowOf(b.id)
            if (!a || !b || !ra || !rb) return null
            const ax = X(Math.min(a.range.end, Math.max(a.range.start, b.range.start))) + 4
            const ay = Y(ra.top) + ra.h / 2
            const bx = X(b.range.start) + 2
            const by = Y(rb.top) + rb.h / 2
            const midX = Math.min(ax, bx) - 18
            const d = `M${ax},${ay} C${midX},${ay} ${midX},${by} ${bx},${by}`
            return (
              <g key={l.id} pointerEvents="none">
                <path d={d} fill="none" stroke={C.text2} strokeWidth={1.3} strokeDasharray="4 3" markerEnd="url(#arrow)" />
                {l.label && <text x={midX - 4} y={(ay + by) / 2} fontSize={10.5} fill={C.text2} textAnchor="end">{l.label}</text>}
              </g>
            )
          })}

          {/* Reference date */}
          <line x1={X(refDay)} x2={X(refDay)} y1={BODY_TOP} y2={size.h} stroke="#5FA548" strokeWidth={2.5} pointerEvents="none" />
          {/* Vigência markers */}
          {hypVig && <line x1={X(hypVig.end)} x2={X(hypVig.end)} y1={BODY_TOP} y2={size.h} stroke={C.scenario} strokeWidth={2} strokeDasharray="7 5" pointerEvents="none" />}
          {docVig && <line x1={X(docVig.end)} x2={X(docVig.end)} y1={BODY_TOP} y2={size.h} stroke={C.vigLine} strokeWidth={2.5} pointerEvents="none" />}

          {/* Annotations */}
          {view.showAnnotations && doc.annotations.map((a) => <g key={a.id}>{AnnotationShape({ a })}</g>)}

          {/* Drop indicator for a vertical move */}
          {dropLine && <line x1={LABEL_W - 120} x2={size.w} y1={Y(dropLine.lineY)} y2={Y(dropLine.lineY)} stroke={C.blue} strokeWidth={2.5} pointerEvents="none" />}
        </g>

        {/* Marker captions (bottom of body) */}
        <g pointerEvents="none" fontSize={12} fontWeight={700}>
          {docVig && X(docVig.end) > LABEL_W && X(docVig.end) < size.w && (
            <g transform={`translate(${X(docVig.end) + 6},${size.h - 34})`}>
              <rect x={-2} y={-15} width={textWidth(`↑ ${fmtDate(fromDay(docVig.end - 1))} · encerramento da vigência`, 12.5) + 10} height={21} fill="#FFFFFF" fillOpacity={0.92} />
              <text fill={C.vigLine} fontSize={12.5}>↑ {fmtDate(fromDay(docVig.end - 1))} · encerramento de referência (linha de base documental)</text>
            </g>
          )}
          {hypVig && X(hypVig.end) > LABEL_W && X(hypVig.end) < size.w && (
            <g transform={`translate(${X(hypVig.end) + 6},${size.h - 14})`}>
              <text fill={C.scenario}>┆ {fmtDate(fromDay(hypVig.end - 1))} · cenário simulado (não aprovado)</text>
            </g>
          )}
          {X(refDay) > LABEL_W && X(refDay) < size.w && (
            <text x={X(refDay) - 6} y={size.h - 14} textAnchor="end" fill="#3E7D2C">referência {fmtDate(settings.referenceDate)}</text>
          )}
        </g>

        {/* ── Label column (fixed while scrolling horizontally) ───────────── */}
        <rect x={0} y={BODY_TOP} width={LABEL_W} height={bodyH} fill="#FFFFFF" />
        <g clipPath="url(#clip-labels)">
          {layout.rows.map((r, i) => <g key={`l${i}`}>{RowLabel({ r })}</g>)}
        </g>
        <line x1={LABEL_W} x2={LABEL_W} y1={0} y2={size.h} stroke={C.grid} />

        {/* ── Header: projects · years · semesters · months ──────────────── */}
        <rect x={0} y={0} width={size.w} height={HEADER} fill="#FFFFFF" />
        <g clipPath="url(#clip-header)">
          {bandLanes.map(({ it, lane }) => {
            const color = colorOf(it.projectId)
            const hyp = it.certainty === "hipotese"
            const x1 = X(it.range.start)
            const w = Math.max(2, X(it.range.end) - x1)
            const y = 3 + lane * bandH
            const proj = doc.projects.find((p) => p.id === it.projectId)
            const label = `${proj?.name ?? it.name}${hyp ? " · proposta" : ""}`
            return (
              <g key={`pb${it.id}`} data-hit="label" data-id={it.id} style={{ cursor: "pointer" }} opacity={dimmed(it) ? 0.3 : 1}>
                <rect x={x1 + 1} y={y} width={w - 2} height={bandH - 2} rx={3} fill={hyp ? "#FFFFFF" : color} stroke={color} strokeWidth={hyp ? 1.5 : 0} strokeDasharray={hyp ? "5 3" : undefined} />
                <text x={Math.max(x1, LABEL_W) + 8} y={y + bandH / 2 + 3.5} fontSize={bandRows > 1 ? 10.5 : 12} fontWeight={700} fill={hyp ? color : "#FFFFFF"}>
                  {truncate(label, Math.min(X(it.range.end), size.w) - Math.max(x1, LABEL_W) - 14, bandRows > 1 ? 10.5 : 12)}
                </text>
                <title>{`${it.name} · ${fmtDate(it.start, it.precision)} – ${fmtDate(it.end, it.precision)}`}</title>
              </g>
            )
          })}
          {years.map((y) => {
            const x1 = X(dayOf(y, 1))
            const x2 = X(dayOf(y + 1, 1))
            const skip = (yearW < 46 && y % 2 === 1) || Math.min(x2, size.w) - Math.max(x1, LABEL_W) < 40
            return (
              <g key={`hy${y}`}>
                <rect x={x1 + 1} y={PROJ_H} width={Math.max(0, x2 - x1 - 2)} height={YEAR_H - 2} fill="#E6EBF1" />
                {!skip && (
                  <text x={(Math.max(x1, LABEL_W) + Math.min(x2, size.w)) / 2} y={PROJ_H + 17} fontSize={14} fontWeight={700} fill={C.text} textAnchor="middle">{y}</text>
                )}
              </g>
            )
          })}
          {halves.map((h, i) => (
            <g key={`hs${i}`}>
              <rect x={X(h.day) + 1} y={PROJ_H + YEAR_H} width={Math.max(0, X(h.end) - X(h.day) - 2)} height={SEM_H - 2} fill="#F1F4F8" />
              {X(h.end) - X(h.day) > 26 && (
                <text x={X(h.day) + (X(h.end) - X(h.day)) / 2} y={PROJ_H + YEAR_H + 14} fontSize={11.5} fontWeight={600} fill={C.text2} textAnchor="middle">{h.label}</text>
              )}
            </g>
          ))}
          {months.map((m, i) => {
            const w = X(addMonths(m.day, 1)) - X(m.day)
            const isAfter = docVig && m.day >= docVig.end
            return (
              <g key={`hm${i}`}>
                {isAfter && <rect x={X(m.day)} y={HEADER - MONTH_H - 4} width={w} height={MONTH_H} fill={C.afterSoft} />}
                {m.label && (
                  <text x={X(m.day) + w / 2} y={HEADER - 9} fontSize={9.5} fontFamily="JetBrains Mono, monospace" fill={docVig && m.day === docVig.end ? C.vigLine : "#8796A8"} fontWeight={docVig && m.day === docVig.end ? 800 : 500} textAnchor="middle">
                    {m.label}
                  </text>
                )}
              </g>
            )
          })}
          {weeks.map((d) => (
            <line key={`wk${d}`} x1={X(d)} x2={X(d)} y1={HEADER - 4} y2={HEADER} stroke="#C9D3DE" />
          ))}
          {docVig && <line x1={X(docVig.end)} x2={X(docVig.end)} y1={PROJ_H + YEAR_H} y2={HEADER} stroke={C.vigLine} strokeWidth={2.5} />}
        </g>
        {/* Header corner: the page's title block */}
        <text x={18} y={26} fontSize={17} fontWeight={800} fill={C.text} fontFamily="Inter Tight, Inter, sans-serif">Tempo: Vigência x Projeto</text>
        <text x={18} y={44} fontSize={11.5} fill={C.text2}>SKA Tech Hub — Projetos 1, 2 e 3</text>
        <line x1={0} x2={size.w} y1={HEADER} y2={HEADER} stroke={C.grid} />

        {/* Horizontal scrollbar over the whole horizon */}
        <g>
          <rect x={LABEL_W + 8} y={size.h - 6} width={Math.max(0, timeW - 16)} height={4} rx={2} fill="#EEF2F6" />
          <rect
            x={LABEL_W + 8 + ((x0 - EXTENT_START) / (EXTENT_END - EXTENT_START)) * (timeW - 16)}
            y={size.h - 7}
            width={Math.max(24, ((timeW / ppd) / (EXTENT_END - EXTENT_START)) * (timeW - 16))}
            height={6}
            rx={3}
            fill="#B6C2D0"
            style={{ cursor: "ew-resize" }}
            onPointerDown={(e) => {
              e.stopPropagation()
              ;(svgRef.current as Element).setPointerCapture(e.pointerId)
              gesture.current = { type: "hscroll", sx: local(e).x, x0 }
            }}
          />
        </g>

        {marquee && (
          <rect x={Math.min(marquee.sx, marquee.cx)} y={Math.min(marquee.sy, marquee.cy)} width={Math.abs(marquee.cx - marquee.sx)} height={Math.abs(marquee.cy - marquee.sy)}
            fill={C.blue} fillOpacity={0.08} stroke={C.blue} strokeDasharray="4 3" pointerEvents="none" />
        )}
      </svg>

      {view.showFinance && <div className="absolute top-0 right-0" style={{ left: size.w }}><FinanceColumn rows={layout.rows} top={HEADER} header={HEADER} height={bodyH} scrollY={scrollY} fins={fins} /></div>}
      {inline && byId.get(inline.id) && <InlineLabel item={byId.get(inline.id)!} {...inline} onClose={() => setInline(null)} />}
      {menu && byId.get(menu.id) && (
        <BlockMenu
          item={byId.get(menu.id)!}
          x={menu.x}
          y={menu.y}
          w={size.w}
          toggleKey={allItemRows.find((r) => r.item.id === menu.id && r.toggle)?.toggle}
          onClose={() => setMenu(null)}
          onRename={() => openInline(menu.id)}
        />
      )}

      {/* Vertical scrollbar */}
      {maxScroll > 0 && (
        <div className="pointer-events-none absolute right-1 w-1.5 rounded-full bg-black/5" style={{ top: HEADER + 4, bottom: 12 }}>
          <div className="absolute w-1.5 rounded-full bg-black/20" style={{ top: `${(scrollY / (layout.total + 60)) * 100}%`, height: `${Math.min(100, (bodyH / (layout.total + 60)) * 100)}%` }} />
        </div>
      )}

      {/* Hover card: full details live here, not on the bar */}
      {hover && hoverItem && !dragHint && (
        <HoverCard item={hoverItem} x={hover.x} y={hover.y} hyp={hover.hyp} w={size.w} refDay={refDay} docVig={docVig} label={offeringLabel(doc, hoverItem, true)} doc={doc} fins={fins} />
      )}
      {dragHint && (
        <div className="pointer-events-none absolute z-20 rounded-md border border-primary/40 bg-white px-3 py-2 text-xs shadow-lg" style={{ left: Math.min(dragHint.x + 16, size.w - 280), top: Math.max(HEADER + 6, dragHint.y - 58) }}>
          <div className="font-semibold text-foreground">{dragHint.lines[0]}</div>
          <div className="text-muted-foreground">{dragHint.lines[1]}</div>
        </div>
      )}
      {view.connectFrom && (
        <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 rounded-full border border-primary/40 bg-white px-3 py-1 text-xs shadow" style={{ top: HEADER + 10 }}>
          Conectando a partir de “{byId.get(view.connectFrom)?.name}” — clique no destino (Esc cancela)
        </div>
      )}
    </div>
  )

  // ── Row pieces ───────────────────────────────────────────────────────────
  function RowLabel({ r }: { r: Row }) {
    const y = Y(r.top)
    if (r.type === "project") return ProjectLabel({ r })
    if (r.type === "note") return null
    if (r.type === "heading")
      return (
        <g>
          <rect x={0} y={y} width={LABEL_W} height={r.h} fill="#FFFFFF" />
          <text x={16} y={y + r.h / 2 + 4} fontSize={10.5} fontWeight={800} letterSpacing={1.6} fill={C.text3}>{r.text}</text>
          <line x1={16 + textWidth(r.text, 10.5) + 18} x2={LABEL_W - 12} y1={y + r.h / 2} y2={y + r.h / 2} stroke={C.grid} />
        </g>
      )
    if (r.type === "lane") return LaneLabel({ r })
    if (r.type === "comp") {
      const x = 14 + r.depth * 16
      const label = `${r.prefix ? `${r.prefix} › ` : ""}${r.comp === "sem_vinculo" ? COMP_LABEL.sem_vinculo : COMP_LABEL[r.comp]}`
      const first = r.fins.find((f) => f.kind === "aquisicao") ?? r.fins[0]
      return (
        <g data-hit={first ? "fin" : "label"} data-id={first ? first.id : (r.actionId ?? "")} style={{ cursor: "pointer" }} opacity={r.action && dimmed(r.action) ? 0.4 : 1}>
          <rect x={0} y={y} width={LABEL_W} height={r.h} fill={first && selectedFin === first.id ? "#E6F2FA" : r.index % 2 === 1 ? "#FAFBFD" : "#FFFFFF"} />
          <path d={`M${x - 8},${y} V${y + r.h / 2} H${x - 2}`} fill="none" stroke="#C9D3DE" />
          <text x={x + 2} y={y + r.h / 2 + 4} fontSize={11.5} fontWeight={600} fill={r.comp === "sem_vinculo" ? "#8A5A10" : C.text2}>{truncate(label, LABEL_W - x - 26, 11.5)}</text>
          {r.fins.length > 0 && <text x={LABEL_W - 12} y={y + r.h / 2 + 4} fontSize={10.5} fill={C.text3} textAnchor="end">{r.fins.length}</text>}
          <title>{`${label}${r.empty ? ` — ${r.empty}` : ` — ${r.fins.length} registro(s)`}. Cada registro financeiro é único; esta linha só o exibe.`}</title>
        </g>
      )
    }
    if ((r.type === "item" || r.type === "consolidated") && r.depth != null) return HierLabel({ r })
    if (r.type === "group") {
      const g = GROUPS.find((x) => x.id === r.group)!
      const color = GROUP_COLOR[r.group]
      return (
        <g>
          <g data-hit="g-collapse" data-id={r.group} style={{ cursor: "pointer" }}>
            <rect x={0} y={y} width={LABEL_W} height={r.h} fill="#FFFFFF" />
            <path d={r.collapsed ? `M14,${y + 13} l5,4 l-5,4` : `M12,${y + 15} l4,5 l4,-5`} fill="none" stroke={color} strokeWidth={1.8} />
            <text x={28} y={y + 21.5} fontSize={11.5} fontWeight={800} letterSpacing={1.1} fill={color}>
              {r.label ? r.label.toUpperCase() : `${g.code} · ${g.label.toUpperCase()}`}
            </text>
            <title>{r.collapsed ? "Expandir grupo" : "Recolher grupo"}</title>
          </g>
          {r.collapsed && <text x={LABEL_W - 12} y={y + 21.5} fontSize={10.5} fill={C.text3} textAnchor="end">{r.count} itens</text>}
        </g>
      )
    }
    if (r.type === "more") {
      return (
        <g data-hit="g-detail" data-id={r.group} style={{ cursor: "pointer" }}>
          <text x={LABEL_W - 14} y={y + 18} fontSize={11.5} fontWeight={600} fill={C.blue} textAnchor="end">
            {r.count > 0 ? `+ ${r.count} ${r.count === 1 ? "item de detalhe" : "itens de detalhe"}` : "− ocultar detalhes"}
          </text>
          <title>{r.count > 0 ? "Mostrar turmas, atividades, contratos e marcos deste grupo" : "Voltar à visão limpa neste grupo"}</title>
        </g>
      )
    }
    if (r.type === "consolidated") {
      const allSel = r.members.length > 0 && r.members.every((m) => sel.has(m.id))
      return (
        <g data-hit="cons-label" data-id={r.key} style={{ cursor: "pointer" }}>
          <rect x={0} y={y} width={LABEL_W} height={r.h} fill={allSel ? "#E6F2FA" : r.index % 2 === 1 ? "#FAFBFD" : "#FFFFFF"} />
          {allSel && <rect x={0} y={y} width={3} height={r.h} fill={C.blue} />}
          <text fontSize={12.5} textAnchor="end" fill={C.text}>
            <tspan x={LABEL_W - 30} y={y + r.h / 2 - 1} fontWeight={700}>{r.name}</tspan>
            {r.subtitle && <tspan x={LABEL_W - 30} y={y + r.h / 2 + 12} fontSize={11} fill={C.text2}>{r.subtitle}</tspan>}
          </text>
          <g transform={`translate(${LABEL_W - 16},${y + r.h / 2})`}>
            <circle r={8} fill={C.blue} fillOpacity={0.12} />
            <text y={3.5} fontSize={9.5} fontWeight={800} fill={C.blue} textAnchor="middle">{r.members.length}</text>
          </g>
          <title>{`${r.name} — ${r.members.length} registro(s) agrupados nesta linha. Os registros de origem continuam separados.`}</title>
        </g>
      )
    }
    const it = r.item
    const isSel = sel.has(it.id)
    const st = statusOf(it, refDay)
    const main = it.kind === "curso" || it.kind === "vigencia" || it.kind === "planejamento" || it.kind === "projeto"
    const name = r.virtual ? "Vigência — cenário simulado" : it.name
    return (
      <g data-hit="label" data-id={it.id} style={{ cursor: "pointer" }} opacity={dimmed(it) ? 0.4 : 1}>
        <rect x={0} y={y} width={LABEL_W} height={r.h} fill={isSel ? "#E6F2FA" : r.index % 2 === 1 && !r.virtual ? "#FAFBFD" : "#FFFFFF"} />
        {isSel && <rect x={0} y={y} width={3} height={r.h} fill={C.blue} />}
        <StatusGlyph x={LABEL_W - 16} y={y + r.h / 2} status={st.key} pending={st.pending} color={itemColor(it.kind, colorOf(it.projectId), it.color)} />
        {(() => {
          // "Projeto 1 — Fundação e histórico" reads as title + qualifier: two lines, not an ellipsis.
          const fs = 12.5
          const [head, ...rest] = name.split(" — ")
          const tail = rest.join(" — ")
          const two = textWidth(name, fs) > LABEL_W - 46 && !!tail
          return two ? (
            <text fontSize={fs} textAnchor="end" fill={C.text}>
              <tspan x={LABEL_W - 30} y={y + r.h / 2 - 1} fontWeight={main ? 700 : 500}>{truncate(head, LABEL_W - 46, fs)}</tspan>
              <tspan x={LABEL_W - 30} y={y + r.h / 2 + 12} fontSize={11} fill={C.text2}>{truncate(tail, LABEL_W - 46, 11)}</tspan>
            </text>
          ) : (
            <text x={LABEL_W - 30} y={y + r.h / 2 + 4.5} fontSize={fs} fontWeight={main ? 700 : 500} fill={r.virtual ? C.navy : C.text} textAnchor="end" fontStyle={r.virtual ? "italic" : undefined}>
              {truncate(name, LABEL_W - 46, fs)}
            </text>
          )
        })()}
        <title>{`${name}\n${KIND_LABEL[it.kind]} · ${st.label}`}</title>
      </g>
    )
  }

  function ItemBar({ r }: { r: Extract<Row, { type: "item" }> }) {
    const it = r.item
    const top = Y(r.top)
    const cy = top + r.h / 2
    const BH = r.thin ? 16 : BAR_H
    const by = cy - BH / 2
    const isSel = sel.has(it.id)
    const dim = dimmed(it)
    const color = itemColor(it.kind, colorOf(it.projectId), it.color)
    const docRow = it.kind === "vigencia" && it.baseRange && !r.virtual
    const range = docRow ? it.baseRange! : it.range
    const x1 = X(range.start)
    const x2 = X(range.end)
    if (x2 < LABEL_W - 60 || x1 > size.w + 60) return null
    const w = Math.max(2, x2 - x1)
    const status = r.virtual ? ("cenario" as StatusKey) : docRow ? "previsto" : statusOf(it, refDay).key
    const bs0 = barStyleFor(status, color)
    // A proposed project keeps its identity colour (dashed); purple-indigo marks scenario changes only.
    if (it.kind === "projeto" && status === "cenario") bs0.stroke = color
    // Design tab: appearance only — never dates, status or values.
    const sty = it.style ?? {}
    const bs = { ...bs0, fill: sty.fill ?? bs0.fill, stroke: sty.stroke ?? bs0.stroke, strokeWidth: sty.strokeWidth ?? bs0.strokeWidth, text: sty.textColor ?? bs0.text }
    const rx = sty.radius ?? 3
    const fontFamily = sty.font ? FONT_FAMILY[sty.font] : undefined
    const fw = sty.weight ?? 600
    const hitKind = docRow ? "item-static" : "item"
    const enter = (e: React.PointerEvent) => !gesture.current && setHover({ id: it.id, x: local(e).x, y: top + r.h, hyp: r.virtual === "hyp" })
    const leave = () => setHover((h) => (h?.id === it.id ? null : h))
    const fsz = sty.size ?? (r.thin ? 10.5 : 11.5)
    const gOpacity = (dim ? 0.3 : 1) * (sty.opacity ?? 1)

    // Historic action without a dated source: an approximate interval, never a solid bar.
    if (it.dateUndetermined) {
      const mid = (Math.max(x1, LABEL_W) + Math.min(x2, size.w)) / 2
      const label = "data a validar"
      const tags = r.info?.tags ?? []
      return (
        <g opacity={dim ? 0.3 : 1} onPointerEnter={enter} onPointerLeave={leave}>
          <rect data-hit="item" data-id={it.id} x={x1} y={by} width={w} height={BH} fill="transparent" style={{ cursor: "grab" }} />
          <line x1={x1} x2={x2} y1={cy} y2={cy} stroke={C.plan} strokeWidth={2} strokeDasharray="2 4" pointerEvents="none" />
          <line x1={x1} x2={x1} y1={cy - 6} y2={cy + 6} stroke={C.plan} strokeWidth={2} pointerEvents="none" />
          <line x1={x2} x2={x2} y1={cy - 6} y2={cy + 6} stroke={C.plan} strokeWidth={2} pointerEvents="none" />
          <g pointerEvents="none">
            <rect x={mid - 52} y={cy - 10} width={104} height={20} rx={10} fill="#FFFFFF" stroke="#C9D3DE" />
            <text x={mid} y={cy + 4} fontSize={11} fontWeight={600} fill={C.text2} textAnchor="middle">{label}</text>
          </g>
          {tags.length > 0 && (r.compact ? Tags({ x: Math.max(x1, LABEL_W) + 10, y: cy - 8.5, tags: tags.slice(0, 1), maxX: mid - 56 }) : Tags({ x: x2 + 10, y: cy - 8.5, tags, maxX: size.w - 8 }))}
          {ClipMarks({ x1, x2, y: by, h: BH, fill: C.plan })}
          {isSel && <rect x={x1 - 2} y={by - 2} width={w + 4} height={BH + 4} rx={4} fill="none" stroke={C.selection} strokeWidth={2} pointerEvents="none" />}
        </g>
      )
    }

    if (it.kind === "marco") {
      return (
        <g opacity={dim ? 0.3 : 1} onPointerEnter={enter} onPointerLeave={leave}>
          <path data-hit="item" data-id={it.id} d={`M${x1},${cy - 9} L${x1 + 9},${cy} L${x1},${cy + 9} L${x1 - 9},${cy} Z`} fill={st0(it) ? "#FFFFFF" : C.navy} stroke={C.navy} strokeWidth={2} style={{ cursor: "grab" }} />
          <text x={r.compact ? x1 - 14 : x1 + 15} y={cy + 4} fontSize={12} fontWeight={600} fill={C.text} textAnchor={r.compact ? "end" : "start"} pointerEvents="none">{fmtDate(it.start)}</text>
          {isSel && <circle cx={x1} cy={cy} r={14} fill="none" stroke={C.selection} strokeWidth={2} pointerEvents="none" />}
        </g>
      )
    }

    // Part after the documental vigência (calendar fact — not a statement about coverage).
    const after = docVig && !r.virtual && !docRow && it.kind !== "vigencia" && it.kind !== "projeto" && it.kind !== "planejamento" ? partAfter(range, docVig) : null
    const afterMonths = after ? calendarMonthsTouched(after) : 0
    const afterW = after ? X(after.end) - X(after.start) : 0
    const shortDates = `${shortMonth(range.start)} – ${shortMonth(range.end - 1)}`
    const room = (after ? X(after.start) : x2) - Math.max(x1, LABEL_W) - 16
    const innerLabel =
      r.virtual ? `até ${fmtDate(fromDay(range.end - 1))} · cenário`
      : docRow ? `até ${fmtDate(fromDay(range.end - 1))} · referência documental`
      : it.kind === "vigencia" ? `até ${fmtDate(fromDay(range.end - 1))}`
      : it.kind === "curso" ? pickFit(r.compact ? [offeringLabel(doc, it, false), shortNameOf(it), shortDates] : [offeringLabel(doc, it, true), offeringLabel(doc, it, false), shortDates], room - (r.toggle ? 18 : 0))
      : it.shortName ? pickFit([`${it.shortName} · ${shortDates}`, shortDates], room)
      : shortDates
    const fitsInside = textWidth(innerLabel, fsz) < room
    const narrow = w < 12
    const showAfterLabel = after && (it.kind === "curso" || it.kind === "turma" || isSel)
    const hasToggle = !!r.compact && !!r.toggle && !narrow && w > 30
    const labelX = Math.max(x1, LABEL_W) + 9 + (hasToggle ? 18 : 0)
    // Tags sit next to the label, inside the bar when there is room, otherwise after it.
    // In the modality view only the acquisition indicator is shown; details live in the hover.
    const tags = r.compact ? (r.info?.tags ?? []).slice(0, 1) : (r.info?.tags ?? [])
    const tagsInside = fitsInside ? labelX + textWidth(innerLabel, fsz) + 10 : null
    // Only the visible part of the after-vigência stretch can hold its label.
    const afterVis = after ? Math.min(X(after.end), size.w) - Math.max(X(after.start), LABEL_W) : 0
    const afterText = after && afterVis > 56 ? (afterVis > textWidth(`${afterMonths} meses após a vigência`, fsz) + 20 ? `${afterMonths} meses após a vigência` : `+${afterMonths} m`) : null
    const afterTextX = after ? Math.min(X(after.end), size.w) - 8 : 0
    const tagMaxInside = afterText ? afterTextX - textWidth(afterText, fsz) - 10 : x2 - 6
    const tagsTotal = tags.reduce((s2, t) => s2 + textWidth(t.label, 10) + 16, 0)
    const tagX = tagsInside != null && tagsInside + Math.min(tagsTotal, 150) < tagMaxInside ? tagsInside : x2 + 10
    const tagLimit = tagX === tagsInside ? tagMaxInside : size.w - 8
    const parcels = it.kind === "bolsa" ? fins.filter((f) => f.kind === "parcela" && f.actionId === it.id) : []

    return (
      <g opacity={gOpacity} onPointerEnter={enter} onPointerLeave={leave} fontFamily={fontFamily}>
        {it.baseRange && r.virtual === undefined && !docRow && (
          <rect x={X(it.baseRange.start)} y={by - 2} width={Math.max(2, (it.baseRange.end - it.baseRange.start) * ppd)} height={BH + 4} rx={4}
            fill="none" stroke={C.text3} strokeDasharray="2 3" pointerEvents="none" />
        )}
        {narrow ? (
          <>
            <circle data-hit={hitKind} data-id={it.id} cx={x1 + w / 2} cy={cy} r={6} fill={bs.fill} stroke={bs.stroke} strokeWidth={1.5} style={{ cursor: "grab" }} />
            <text x={x1 + w / 2 + 11} y={cy + 4} fontSize={fsz} fill={C.text2} pointerEvents="none">{shortDates}</text>
          </>
        ) : (
          <rect data-hit={hitKind} data-id={it.id} x={x1} y={by} width={w} height={BH} rx={rx}
            fill={bs.fill} fillOpacity={sty.fill ? 1 : bs.fillOpacity} stroke={bs.stroke} strokeWidth={bs.strokeWidth} strokeDasharray={bs.dash}
            style={{ cursor: it.locked || docRow ? "pointer" : "grab" }} />
        )}
        {/* After the vigência: moderate overlay on the same bar — the period continues, nothing is cut. */}
        {after && !narrow && (
          <g pointerEvents="none">
            <rect x={X(after.start)} y={by} width={Math.max(2, afterW)} height={BH} rx={3} fill="url(#stripe-after)" />
            <rect x={X(after.start)} y={by + BH - 3} width={Math.max(2, afterW)} height={3} fill={C.after} />
          </g>
        )}
        {!narrow && (fitsInside ? (
          <text x={labelX} y={cy + 4} fontSize={fsz} fontWeight={fw} fill={bs.text} pointerEvents="none">{innerLabel}</text>
        ) : !after && x2 + 8 + textWidth(innerLabel, fsz) < size.w ? (
          <text x={x2 + 8} y={cy + 4} fontSize={fsz} fill={C.text2} pointerEvents="none">{innerLabel}</text>
        ) : null)}
        {hasToggle && (
          <g data-hit="h-toggle" data-id={r.toggle} style={{ cursor: "pointer" }}>
            <circle cx={labelX - 15} cy={cy} r={7.5} fill="#FFFFFF" fillOpacity={0.92} stroke={bs.stroke === "#FFFFFF" ? C.grid : bs.stroke} strokeWidth={1} />
            <path d={r.expanded ? `M${labelX - 19},${cy - 1.5} l4,4 l4,-4` : `M${labelX - 16.5},${cy - 4} l4,4 l-4,4`} fill="none" stroke={C.text} strokeWidth={1.6} />
            <title>{r.expanded ? "Recolher componentes" : "Expandir: aquisição, bolsas, NF e materiais"}</title>
          </g>
        )}
        {tags.length > 0 && !r.thin && Tags({ x: fitsInside || after ? tagX : Math.max(tagX, x2 + 10 + (fitsInside ? 0 : textWidth(innerLabel, fsz) + 8)), y: cy - 8.5, tags, maxX: tagLimit })}
        {status === "concluido" && w > 30 && <path d={`M${x2 - 18},${cy} l4,4 l8,-8`} stroke="#FFFFFF" strokeWidth={2} fill="none" pointerEvents="none" />}
        {afterText && (
          <text x={afterTextX} y={cy + 4} fontSize={fsz} fontWeight={700} fill={status === "cenario" || status === "planejado" ? C.afterText : "#FFFFFF"} stroke={status === "cenario" || status === "planejado" ? "none" : color} strokeWidth={3} paintOrder="stroke" textAnchor="end" pointerEvents="none">
            {afterText}
          </text>
        )}
        {showAfterLabel && afterW <= 56 && (
          <text x={X(after!.end) + 8} y={cy + 4} fontSize={fsz} fontWeight={700} fill={C.afterText} pointerEvents="none">+{afterMonths} meses após a vigência</text>
        )}
        {parcels.map((f) => {
          const pr = finRange(f)
          if (!pr) return null
          const px = X(pr.start)
          const pc = f.parcelStatus === "paga" ? C.paid : f.parcelStatus === "devida" ? C.after : f.parcelStatus === "pendente" ? C.amber : C.muted
          return (
            <circle key={f.id} data-hit="fin" data-id={f.id} cx={px} cy={by - 1} r={3.5} fill={f.parcelStatus === "paga" ? pc : "#FFFFFF"} stroke={pc} strokeWidth={1.5} style={{ cursor: "pointer" }}>
              <title>{`${f.name} · ${PARCEL_LABEL[f.parcelStatus ?? "prevista"]} · ${fmtDate(f.start!)}`}</title>
            </circle>
          )
        })}
        {it.changed && !docRow && (
          <g pointerEvents="none" transform={`translate(${x1},${by - 9})`}>
            <rect width={50} height={12} rx={2} fill={C.scenario} />
            <text x={25} y={9} fontSize={8.5} fontWeight={800} textAnchor="middle" fill="#FFFFFF" letterSpacing={0.6}>CENÁRIO</text>
          </g>
        )}
        {!narrow && ClipMarks({ x1, x2, y: by, h: BH, fill: bs.text })}
        {isSel && (
          <>
            <rect x={x1 - 2} y={by - 2} width={w + 4} height={BH + 4} rx={4} fill="none" stroke={C.selection} strokeWidth={2} pointerEvents="none" />
            {!it.locked && !docRow && !narrow && (
              <>
                <rect data-hit="item-l" data-id={it.id} x={x1 - 4} y={by + 4} width={8} height={Math.max(6, BH - 8)} rx={2} fill="#FFFFFF" stroke={C.selection} strokeWidth={1.5} style={{ cursor: "ew-resize" }} />
                <rect data-hit="item-r" data-id={it.id} x={x2 - 4} y={by + 4} width={8} height={Math.max(6, BH - 8)} rx={2} fill="#FFFFFF" stroke={C.selection} strokeWidth={1.5} style={{ cursor: "ew-resize" }} />
              </>
            )}
          </>
        )}
        {!isSel && !it.locked && !docRow && !narrow && w > 16 && (
          <>
            <rect data-hit="item-l" data-id={it.id} x={x1 - 3} y={by} width={7} height={BH} fill="transparent" style={{ cursor: "ew-resize" }} />
            <rect data-hit="item-r" data-id={it.id} x={x2 - 4} y={by} width={7} height={BH} fill="transparent" style={{ cursor: "ew-resize" }} />
          </>
        )}
      </g>
    )
  }

  /** Portfolio mode: the cycle, and — for a project with a vigência — its documental and simulated periods. */
  function PortfolioBar({ r }: { r: Extract<Row, { type: "item" }> }) {
    const it = r.item
    const top = Y(r.top)
    const color = colorOf(it.projectId)
    const hyp = it.certainty === "hipotese"
    const x1 = X(it.range.start)
    const x2 = X(it.range.end)
    const isSel = sel.has(it.id)
    const proj = doc.projects.find((p) => p.id === it.projectId)
    const pv = doc.items.find((i) => i.kind === "vigencia" && i.projectId === it.projectId)
    const pvRange = pv ? docVigRange(doc, it.projectId ?? "") : null
    const pvEff = items.find((i) => i.kind === "vigencia" && i.projectId === it.projectId)
    const pvHyp = pvEff && pvRange && pvEff.range.end !== pvRange.end ? pvEff.range : null
    const label = `${proj?.name ?? it.name} · ${proj?.phase ?? ""}`
    const period = it.precision === "year" ? `${it.start.slice(0, 4)}–${it.end.slice(0, 4)}` : `${shortMonth(it.range.start)} – ${shortMonth(it.range.end - 1)}`
    const enter = (e: React.PointerEvent) => !gesture.current && setHover({ id: it.id, x: local(e).x, y: top + r.h })
    const leave = () => setHover((h) => (h?.id === it.id ? null : h))
    return (
      <g opacity={dimmed(it) ? 0.3 : 1} onPointerEnter={enter} onPointerLeave={leave}>
        <rect data-hit="item" data-id={it.id} x={x1} y={top + 8} width={Math.max(2, x2 - x1)} height={32} rx={4}
          fill={hyp ? "#FFFFFF" : color} stroke={color} strokeWidth={hyp ? 2 : 0} strokeDasharray={hyp ? "7 4" : undefined} style={{ cursor: "grab" }} />
        <text x={Math.max(x1, LABEL_W) + 12} y={top + 29} fontSize={13} fontWeight={700} fill={hyp ? color : "#FFFFFF"} pointerEvents="none">
          {truncate(`${label}  ·  ${period}${hyp ? " · em modelagem" : ""}`, Math.min(x2, size.w) - Math.max(x1, LABEL_W) - 20, 13)}
        </text>
        {pvRange && (
          <g pointerEvents="none">
            <rect x={X(pvRange.start)} y={top + 45} width={X(pvRange.end) - X(pvRange.start)} height={8} rx={2} fill={C.navy} />
            {pvHyp && <rect x={X(pvRange.end)} y={top + 45} width={Math.max(0, X(pvHyp.end) - X(pvRange.end))} height={8} rx={2} fill="#FFFFFF" stroke={C.navy} strokeDasharray="4 3" />}
            <text x={X(pvRange.end) + (pvHyp ? X(pvHyp.end) - X(pvRange.end) : 0) + 8} y={top + 53} fontSize={10.5} fill={C.text2}>
              vigência até {fmtDate(fromDay(pvRange.end - 1))}{pvHyp ? ` · cenário até ${fmtDate(fromDay(pvHyp.end - 1))}` : ""}
            </text>
          </g>
        )}
        {isSel && <rect x={x1 - 3} y={top + 5} width={x2 - x1 + 6} height={38} rx={6} fill="none" stroke={C.selection} strokeWidth={2.5} pointerEvents="none" />}
      </g>
    )
  }

  /** Bolsas de Inglês and other programmes: one row, one segment per record, no artificial continuity. */
  function ConsolidatedBar({ r }: { r: Extract<Row, { type: "consolidated" }> }) {
    const top = Y(r.top)
    const inner = r.h - 10
    const laneH = r.laneCount > 1 ? Math.min(SUB_H + 3, inner / r.laneCount) : BAR_H
    const y0 = top + (r.h - laneH * r.laneCount) / 2
    return (
      <g>
        {r.members.map((m, k) => {
          const color = itemColor(m.kind, colorOf(m.projectId), m.color)
          const st = statusOf(m, refDay)
          const bs = barStyleFor(st.key, color)
          const x1 = X(m.range.start)
          const x2 = X(m.range.end)
          const by = y0 + r.lanes[k] * laneH + 1
          const h = laneH - 2
          const isSel = sel.has(m.id)
          const after = docVig ? partAfter(m.range, docVig) : null
          const label = `${shortMonth(m.range.start)} – ${shortMonth(m.range.end - 1)}`
          return (
            <g key={m.id} opacity={dimmed(m) ? 0.3 : 1}
              onPointerEnter={(e) => !gesture.current && setHover({ id: m.id, x: local(e).x, y: by + h })}
              onPointerLeave={() => setHover((hv) => (hv?.id === m.id ? null : hv))}>
              <rect data-hit="item" data-id={m.id} x={x1} y={by} width={Math.max(2, x2 - x1)} height={h} rx={3}
                fill={bs.fill} fillOpacity={bs.fillOpacity} stroke={bs.stroke} strokeWidth={Math.max(1, bs.strokeWidth)} strokeDasharray={bs.dash} style={{ cursor: "grab" }} />
              {after && <rect x={X(after.start)} y={by} width={Math.max(2, X(after.end) - X(after.start))} height={h} rx={3} fill={st.key === "planejado" || st.key === "cenario" ? "none" : "url(#stripe-after)"} stroke={C.after} strokeWidth={st.key === "planejado" || st.key === "cenario" ? 1.5 : 0} pointerEvents="none" />}
              {textWidth(label, 10.5) < x2 - x1 - 12 && (
                <text x={Math.max(x1, LABEL_W) + 7} y={by + h / 2 + 3.5} fontSize={10.5} fontWeight={600} fill={bs.text} pointerEvents="none">{label}</text>
              )}
              {isSel && (
                <>
                  <rect x={x1 - 2} y={by - 2} width={x2 - x1 + 4} height={h + 4} rx={4} fill="none" stroke={C.selection} strokeWidth={2} pointerEvents="none" />
                  {!m.locked && (
                    <>
                      <rect data-hit="item-l" data-id={m.id} x={x1 - 4} y={by + 1} width={8} height={h - 2} rx={2} fill="#FFFFFF" stroke={C.selection} strokeWidth={1.5} style={{ cursor: "ew-resize" }} />
                      <rect data-hit="item-r" data-id={m.id} x={x2 - 4} y={by + 1} width={8} height={h - 2} rx={2} fill="#FFFFFF" stroke={C.selection} strokeWidth={1.5} style={{ cursor: "ew-resize" }} />
                    </>
                  )}
                </>
              )}
            </g>
          )
        })}
      </g>
    )
  }

  /**
   * Very light identity background over each project's period. Where two projects overlap, the
   * band alternates both colours in thin stripes instead of mixing them into a third colour.
   */
  function ProjectTints() {
    const ps = projects.map((p) => ({ id: p.projectId ?? p.id, color: colorOf(p.projectId), r: p.range, hyp: p.certainty === "hipotese" }))
    const cuts = [...new Set(ps.flatMap((p) => [p.r.start, p.r.end]))].sort((a, b) => a - b)
    const segs: { a: number; b: number; on: typeof ps }[] = []
    for (let i = 0; i < cuts.length - 1; i++) {
      const on = ps.filter((p) => p.r.start <= cuts[i] && p.r.end >= cuts[i + 1])
      if (on.length) segs.push({ a: cuts[i], b: cuts[i + 1], on })
    }
    return (
      <g pointerEvents="none" data-tints="">
        <defs>
          {ps.map((p) => (
            <linearGradient key={p.id} id={`tint-${p.id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={p.color} stopOpacity={p.hyp ? 0.07 : 0.085} />
              <stop offset="1" stopColor={p.color} stopOpacity={0.025} />
            </linearGradient>
          ))}
          {segs.filter((sg) => sg.on.length > 1).map((sg) => (
            <pattern key={sg.on.map((o) => o.id).join("-")} id={`tint-mix-${sg.on.map((o) => o.id).join("-")}`} patternUnits="userSpaceOnUse" width={12 * sg.on.length} height="12" patternTransform="rotate(90)">
              {sg.on.map((o, k) => <rect key={o.id} x={k * 12} width="12" height="12" fill={o.color} fillOpacity={0.06} />)}
            </pattern>
          ))}
        </defs>
        {segs.map((sg) => (
          <rect key={`${sg.a}`} data-project-tint={sg.on.map((o) => o.id).join(",")} x={X(sg.a)} y={BODY_TOP} width={Math.max(0, X(sg.b) - X(sg.a))} height={bodyH}
            fill={sg.on.length > 1 ? `url(#tint-mix-${sg.on.map((o) => o.id).join("-")})` : `url(#tint-${sg.on[0].id})`} />
        ))}
        {ps.filter((p) => p.hyp).map((p) => (
          <g key={`e${p.id}`}>
            <line x1={X(p.r.start)} x2={X(p.r.start)} y1={BODY_TOP} y2={size.h} stroke={p.color} strokeOpacity={0.45} strokeDasharray="6 5" />
          </g>
        ))}
      </g>
    )
  }

  /** Several records on one row, each at its real dates, in sub-lanes when they overlap. */
  function LaneBars({ r }: { r: Extract<Row, { type: "lane" }> }) {
    const top = Y(r.top)
    if (r.collapsed)
      return (
        <g pointerEvents="none">
          {r.members.map((m) => (
            <rect key={m.item.id} x={X(m.item.range.start)} y={top + r.h / 2 - 3 + m.lane * 0} width={Math.max(3, X(m.item.range.end) - X(m.item.range.start))} height={6} rx={3}
              fill={itemColor(m.item.kind, colorOf(m.item.projectId), m.item.style?.fill ?? m.item.color)} fillOpacity={0.55} />
          ))}
        </g>
      )
    if (!r.members.length && r.empty) return <text x={LABEL_W + 14} y={top + r.h / 2 + 4} fontSize={11.5} fontStyle="italic" fill={C.text3} pointerEvents="none">{r.empty}</text>
    return (
      <g>
        {r.members.map((m) => (
          <g key={m.item.id}>{ItemBar({ r: { type: "item", group: r.group, top: r.top + 6 + m.lane * LANE_H, h: LANE_H, item: m.item, index: r.index, info: m.info, toggle: m.toggle, expanded: m.expanded, compact: true } })}</g>
        ))}
      </g>
    )
  }

  function LaneLabel({ r }: { r: Extract<Row, { type: "lane" }> }) {
    const y = Y(r.top)
    const p = doc.projects.find((x) => x.id === r.projectId)
    const first = r.members[0]?.item
    const isSel = r.members.some((m) => sel.has(m.item.id))
    if (r.kind === "modality") {
      const mod = MODALITIES.find((m) => m.id === r.modality)
      return (
        <g>
          <rect x={0} y={y} width={LABEL_W} height={r.h} fill={isSel ? "#F2F8FC" : r.index % 2 === 1 ? "#FAFBFD" : "#FFFFFF"} />
          <g data-hit="m-collapse" data-id={r.modality} style={{ cursor: "pointer" }}>
            <rect x={0} y={y} width={LABEL_W} height={Math.min(r.h, 44)} fill="transparent" />
            <path d={r.collapsed ? `M16,${y + 13} l5,5 l-5,5` : `M14,${y + 16} l5,5 l5,-5`} fill="none" stroke={C.text2} strokeWidth={1.8} />
            <text x={32} y={y + 22} fontSize={13.5} fontWeight={750} fill={C.text}>{mod?.label ?? r.label}</text>
            <text x={32} y={y + 37} fontSize={11} fill={C.text2}>{r.sub ?? "—"}{r.laneCount > 1 && !r.collapsed ? ` · ${r.laneCount} linhas` : ""}</text>
            <title>{`${mod?.hint ?? ""}. ${r.collapsed ? "Expandir" : "Recolher"} modalidade.`}</title>
          </g>
        </g>
      )
    }
    const fs = r.kind === "project" ? 13 : 12
    return (
      <g data-hit={first ? "label" : undefined} data-id={first?.id} style={{ cursor: first ? "pointer" : "default" }}>
        <rect x={0} y={y} width={LABEL_W} height={r.h} fill={isSel ? "#E6F2FA" : "#FFFFFF"} />
        {r.kind === "project" ? (
          <>
            <rect x={14} y={y + r.h / 2 - 7} width={14} height={14} rx={4} fill={p?.color ?? C.slate} stroke={p?.color} strokeWidth={1.5} strokeDasharray={first?.certainty === "hipotese" ? "3 2" : undefined} fillOpacity={first?.certainty === "hipotese" ? 0.15 : 1} />
            <text fontSize={fs} fill={C.text}>
              <tspan x={36} y={y + r.h / 2 - 2} fontWeight={800}>{r.label}</tspan>
              <tspan x={36} y={y + r.h / 2 + 12} fontSize={11} fill={C.text2}>{projectRole(first, refDay)}{first?.certainty === "hipotese" ? " · em modelagem" : ""}</tspan>
            </text>
          </>
        ) : (
          <>
            <path d={`M24,${y} V${y + r.h / 2} H32`} fill="none" stroke="#C9D3DE" />
            <text fontSize={fs} fill={C.text}>
              <tspan x={38} y={y + r.h / 2 - 2} fontWeight={650}>{r.label}</tspan>
              <tspan x={38} y={y + r.h / 2 + 11} fontSize={10.5} fill={C.text2}>{r.sub}</tspan>
            </text>
          </>
        )}
        <title>{r.kind === "project" ? `${p?.name} — ${p?.phase}. Clique para o resumo do projeto.` : r.label}</title>
      </g>
    )
  }

  /** Section header of the hierarchy: one project, collapsible. */
  function ProjectLabel({ r }: { r: Extract<Row, { type: "project" }> }) {
    const y = Y(r.top)
    const p = doc.projects.find((x) => x.id === r.projectId)
    const color = p?.color ?? C.slate
    const role = projectRole(r.item, refDay)
    const isSel = !!r.item && sel.has(r.item.id)
    return (
      <g>
        <rect x={0} y={y} width={LABEL_W} height={r.h} fill={isSel ? "#E6F2FA" : "#F3F6FA"} />
        <rect x={0} y={y} width={4} height={r.h} fill={color} />
        {r.projectId && (
          <g data-hit="p-toggle" data-id={r.projectId} style={{ cursor: "pointer" }}>
            <rect x={6} y={y} width={24} height={r.h} fill="transparent" />
            <path d={r.collapsed ? `M14,${y + r.h / 2 - 5} l5,5 l-5,5` : `M12,${y + r.h / 2 - 2} l5,5 l5,-5`} fill="none" stroke={color} strokeWidth={2} />
            <title>{r.collapsed ? "Expandir projeto" : "Recolher projeto"}</title>
          </g>
        )}
        <g data-hit={r.item ? "label" : undefined} data-id={r.item?.id} style={{ cursor: r.item ? "pointer" : "default" }}>
          <text x={32} y={y + 19} fontSize={12} fontWeight={800} letterSpacing={0.9} fill={color}>{(p?.name ?? "Sem projeto vinculado").toUpperCase()}</text>
          <text x={32} y={y + 35} fontSize={11.5} fill={C.text2}>{truncate(`${role}${r.item ? ` · ${r.item.precision === "year" ? `${r.item.start.slice(0, 4)}–${r.item.end.slice(0, 4)}` : `${shortMonth(r.item.range.start)} – ${shortMonth(r.item.range.end - 1)}`}` : ""}`, LABEL_W - 70, 11.5)}</text>
          {r.collapsed && <text x={LABEL_W - 12} y={y + 27} fontSize={10.5} fill={C.text3} textAnchor="end">{r.count} ações</text>}
          <title>{`${p?.name ?? ""} — ${p?.phase ?? ""}. Clique para o resumo do projeto.`}</title>
        </g>
      </g>
    )
  }

  /** Label of an action or of a component record, indented under its project. */
  function HierLabel({ r }: { r: Extract<Row, { type: "item" | "consolidated" }> }) {
    const y = Y(r.top)
    const depth = r.depth ?? 1
    const x = 14 + depth * 16
    const it = r.type === "item" ? r.item : r.members[0]
    const isSel = r.type === "item" ? sel.has(it.id) : r.members.every((m) => sel.has(m.id))
    const st = statusOf(it, refDay)
    const virtual = r.type === "item" && r.virtual
    let line1: string
    let line2 = ""
    if (r.type === "consolidated") {
      line1 = r.name
      line2 = r.subtitle ?? `${r.members.length} ciclos`
    } else if (virtual) {
      line1 = "Vigência — cenário simulado"
      line2 = "hipótese, não aprovada"
    } else if (it.kind === "curso") {
      const lab = offeringLabel(doc, it, false)
      const [a, ...b] = lab.split(" · ")
      line1 = a
      line2 = b.join(" · ")
    } else {
      line1 = r.thin ? (it.consolidation ? it.name.replace(/^.*?—\s*/, "") : shortNameOf(it)) : (it.shortName ?? it.name)
      line2 = r.thin ? "" : it.kind === "vigencia" ? `até ${fmtDate(fromDay((it.baseRange ?? it.range).end - 1))} · documental` : `${KIND_LABEL[it.kind]}${it.dateUndetermined ? " · data a validar" : ""}`
    }
    if (r.via) line2 = r.via
    const hit = r.type === "consolidated" ? "cons-label" : "label"
    const hitId = r.type === "consolidated" ? r.key : it.id
    const fs = r.thin ? 11.5 : 12.5
    return (
      <g opacity={dimmed(it) ? 0.4 : 1}>
        <g data-hit={hit} data-id={hitId} style={{ cursor: "pointer" }}>
          <rect x={0} y={y} width={LABEL_W} height={r.h} fill={isSel ? "#E6F2FA" : r.index % 2 === 1 && !virtual ? "#FAFBFD" : "#FFFFFF"} />
          {isSel && <rect x={0} y={y} width={3} height={r.h} fill={C.blue} />}
          {depth >= 2 && <path d={`M${x - 8},${y} V${y + r.h / 2} H${x - 2}`} fill="none" stroke="#C9D3DE" />}
          {line2 && !r.thin ? (
            <text fontSize={fs} fill={virtual ? C.scenario : C.text}>
              <tspan x={x + 14} y={y + r.h / 2 - 2} fontWeight={700} fontStyle={virtual ? "italic" : undefined}>{truncate(line1, LABEL_W - x - 44, fs)}</tspan>
              <tspan x={x + 14} y={y + r.h / 2 + 11} fontSize={10.5} fill={r.via ? "#8A5A10" : C.text2}>{truncate(line2, LABEL_W - x - 44, 10.5)}</tspan>
            </text>
          ) : (
            <text x={x + (r.thin ? 2 : 14)} y={y + r.h / 2 + 4} fontSize={fs} fontWeight={r.thin ? 500 : 700} fill={virtual ? C.scenario : r.thin ? C.text2 : C.text}>{truncate(line1, LABEL_W - x - 40, fs)}</text>
          )}
          {!virtual && <StatusGlyph x={LABEL_W - 16} y={y + r.h / 2} status={st.key} pending={st.pending} color={itemColor(it.kind, colorOf(it.projectId), it.color)} />}
          <title>{`${r.type === "consolidated" ? r.name : it.name}\n${KIND_LABEL[it.kind]} · ${st.label}${r.via ? `\n${r.via}` : ""}`}</title>
        </g>
        {r.toggle && (
          <g data-hit="h-toggle" data-id={r.toggle} style={{ cursor: "pointer" }} aria-label={r.expanded ? "Recolher ação" : "Expandir ação"}>
            <rect x={x - 4} y={y + r.h / 2 - 10} width={18} height={20} rx={4} fill={r.expanded ? "#E6F2FA" : "transparent"} />
            <path d={r.expanded ? `M${x},${y + r.h / 2 - 2} l5,5 l5,-5` : `M${x + 2},${y + r.h / 2 - 5} l5,5 l-5,5`} fill="none" stroke={C.text2} strokeWidth={1.8} />
            <title>{r.expanded ? "Recolher componentes" : "Expandir: aquisição, bolsas, NF e materiais"}</title>
          </g>
        )}
      </g>
    )
  }

  /** The project's cycle, drawn thin inside its section header. */
  function ProjectBar({ r }: { r: Extract<Row, { type: "project" }> }) {
    const it = r.item
    if (!it) return null
    const top = Y(r.top)
    const color = colorOf(it.projectId)
    const hyp = it.certainty === "hipotese"
    const x1 = X(it.range.start)
    const x2 = X(it.range.end)
    const isSel = sel.has(it.id)
    const role = projectRole(it, refDay)
    const y = top + r.h / 2 - 7
    return (
      <g opacity={dimmed(it) ? 0.3 : 1}>
        <rect data-hit="item" data-id={it.id} x={x1} y={y} width={Math.max(2, x2 - x1)} height={14} rx={3}
          fill={hyp ? "#FFFFFF" : color} fillOpacity={hyp ? 1 : 0.9} stroke={color} strokeWidth={hyp ? 1.6 : 0} strokeDasharray={hyp ? "6 4" : undefined} style={{ cursor: "grab" }} />
        <text x={Math.max(x1, LABEL_W) + 8} y={y - 4} fontSize={11} fontWeight={700} fill={hyp ? color : C.text2} pointerEvents="none">
          {truncate(`${role}${hyp ? " · proposta em modelagem, não aprovada" : ""}`, Math.max(0, Math.min(x2, size.w) - Math.max(x1, LABEL_W) - 12), 11)}
        </text>
        {ClipMarks({ x1, x2, y, h: 14, fill: hyp ? color : "#FFFFFF" })}
        {isSel && <rect x={x1 - 2} y={y - 2} width={x2 - x1 + 4} height={18} rx={4} fill="none" stroke={C.selection} strokeWidth={2} pointerEvents="none" />}
      </g>
    )
  }

  /** Discreet continuity marks when a bar starts before or ends after the visible window. */
  function ClipMarks({ x1, x2, y, h, fill }: { x1: number; x2: number; y: number; h: number; fill: string }) {
    const cy = y + h / 2
    return (
      <g pointerEvents="none">
        {x1 < LABEL_W && x2 > LABEL_W + 14 && <path data-clip="left" d={`M${LABEL_W + 4},${cy} l5,-4 v8 z`} fill={fill} />}
        {x2 > size.w && x1 < size.w - 14 && <path data-clip="right" d={`M${size.w - 6},${cy} l-5,-4 v8 z`} fill={fill} />}
      </g>
    )
  }

  /** Compact tags next to an action's label. */
  function Tags({ x, y, tags, maxX }: { x: number; y: number; tags: Tag[]; maxX: number }) {
    let cx = x
    const out: React.ReactNode[] = []
    for (const t of tags) {
      const w = textWidth(t.label, 10) + 12
      if (cx + w > maxX) break
      const pal = TAG_PALETTE[t.tone]
      out.push(
        <g key={t.label} transform={`translate(${cx},${y})`}>
          <rect width={w} height={17} rx={8.5} fill={pal.bg} stroke={pal.bd} />
          <text x={w / 2} y={12} fontSize={10} fontWeight={700} fill={pal.fg} textAnchor="middle">{t.label}</text>
          {t.title && <title>{t.title}</title>}
        </g>,
      )
      cx += w + 4
    }
    return <g pointerEvents="none" data-tags="">{out}</g>
  }

  /** Financial / documentary components as markers at their real dates — never stretched. */
  function CompBar({ r }: { r: Extract<Row, { type: "comp" }> }) {
    const top = Y(r.top)
    const cy = top + r.h / 2
    const action = r.action
    const dim = action ? dimmed(action) : false
    const startX = Math.max(action ? X(action.range.start) : LABEL_W, LABEL_W) + 8
    if (r.empty) return <text x={startX} y={cy + 4} fontSize={11} fontStyle="italic" fill={C.text3} opacity={dim ? 0.4 : 1} pointerEvents="none">{r.empty}</text>
    let rightmost = -Infinity
    const parts: React.ReactNode[] = []
    const summaries: { f: FinRecord; text: string; tone: string }[] = []
    for (const f of r.fins) {
      const isSelF = selectedFin === f.id
      if (f.kind === "aquisicao") {
        const st = f.acqStatus ?? "planejado"
        const warn = acqWarnings(fins, f)
        const { total } = paidOf(fins, f)
        const text = [
          ACQ_STATUS_LABEL[st] + (st === "integralmente_pago" || st === "parcialmente_pago" ? " (registro)" : ""),
          f.supplier ? `fornecedor ${f.supplier}` : null,
          total != null ? `pago ${total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}` : st === "integralmente_pago" || st === "parcialmente_pago" ? "data e valor do pagamento não informados" : null,
          PROOF_LABEL[f.proof].toLowerCase(),
        ].filter(Boolean).join(" · ")
        summaries.push({ f, text, tone: st === "integralmente_pago" ? C.paid : warn.length ? "#8A5A10" : C.text2 })
        // Dated steps of the acquisition flow, each at its own date.
        const dated = [
          ...(f.contractDate ? [{ label: "contrato", date: f.contractDate }] : []),
          ...(f.steps ?? []).filter((s) => s.done && s.date && !(s.id === "contrato" && f.contractDate)).map((s) => ({ label: STEP_SHORT[s.id] ?? s.id, date: s.date! })),
        ]
        for (const d of dated) {
          const x = X(toDay(d.date))
          rightmost = Math.max(rightmost, x + 8 + textWidth(d.label, 10.5))
          parts.push(
            <g key={`${f.id}${d.label}`} data-hit="fin" data-id={f.id} style={{ cursor: "pointer" }}>
              <path d={`M${x},${cy - 6} L${x + 6},${cy} L${x},${cy + 6} L${x - 6},${cy} Z`} fill={C.navy} stroke={isSelF ? C.selection : "#FFFFFF"} strokeWidth={isSelF ? 2 : 1} />
              <text x={x + 9} y={cy + 4} fontSize={10.5} fontWeight={600} fill={C.navy}>{d.label}</text>
              <title>{`${f.name} · ${d.label} em ${fmtDate(d.date)}`}</title>
            </g>,
          )
        }
        continue
      }
      const rg = finRange(f)
      const label = f.kind === "parcela" ? `${PARCEL_LABEL[f.parcelStatus ?? "prevista"]}` : f.docNumber ? `${f.kind === "nf" ? "NF " : ""}${f.docNumber}` : f.name
      if (!rg) {
        summaries.push({ f, text: `${f.name} · data não informada`, tone: C.text3 })
        continue
      }
      const x1 = X(rg.start)
      const x2 = X(rg.end)
      const proven = f.realized && f.proof === "comprovado"
      const fill = proven ? C.paid : f.realized ? C.slate : "#FFFFFF"
      const stroke = proven ? C.paid : f.realized ? C.slate : C.muted
      const titleText = `${FIN_KIND_LABEL[f.kind]} · ${f.name}\n${f.dateUndetermined ? `janela ${fmtDate(f.start!)} – ${fmtDate(f.end ?? f.start!)} (data a definir)` : fmtDate(f.start!) + (f.end && f.end !== f.start ? ` – ${fmtDate(f.end)}` : "")}\n${f.realized ? "realizado" : "previsto"} · ${PROOF_LABEL[f.proof].toLowerCase()}${f.value != null ? ` · ${f.value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}` : " · valor não informado"}`
      if (f.dateUndetermined) {
        // Only a window is known: a dashed bracket, never a point.
        rightmost = Math.max(rightmost, x2 + 8 + textWidth(`${label} · data a definir`, 10.5))
        parts.push(
          <g key={f.id} data-hit="fin" data-id={f.id} style={{ cursor: "pointer" }}>
            <rect x={x1} y={cy - 7} width={Math.max(4, x2 - x1)} height={14} fill="transparent" />
            <path d={`M${x1},${cy - 6} v12 M${x1},${cy} H${x2} M${x2},${cy - 6} v12`} fill="none" stroke={isSelF ? C.selection : C.muted} strokeWidth={isSelF ? 2.4 : 1.6} strokeDasharray="4 3" />
            <text x={x2 + 8} y={cy + 4} fontSize={10.5} fontWeight={600} fill={C.text2}>{label} · data a definir</text>
            <title>{titleText}</title>
          </g>,
        )
        continue
      }
      const point = x2 - x1 < 10
      rightmost = Math.max(rightmost, (point ? x1 : x2) + 10 + textWidth(label, 10.5))
      parts.push(
        <g key={f.id} data-hit="fin" data-id={f.id} style={{ cursor: "pointer" }}>
          {point ? (
            f.kind === "nf" ? (
              <path d={`M${x1},${cy - 7} L${x1 + 7},${cy} L${x1},${cy + 7} L${x1 - 7},${cy} Z`} fill={fill} stroke={isSelF ? C.selection : stroke} strokeWidth={isSelF ? 2.4 : 1.6} strokeDasharray={f.realized ? undefined : "2 2"} />
            ) : f.kind === "pagamento" || f.kind === "parcela" ? (
              <circle cx={x1} cy={cy} r={6} fill={f.kind === "parcela" && f.parcelStatus === "paga" ? C.paid : fill} stroke={isSelF ? C.selection : stroke} strokeWidth={isSelF ? 2.4 : 1.6} strokeDasharray={f.realized ? undefined : "2 2"} />
            ) : (
              <rect x={x1 - 6} y={cy - 6} width={12} height={12} rx={2} fill={fill} stroke={isSelF ? C.selection : stroke} strokeWidth={isSelF ? 2.4 : 1.6} strokeDasharray={f.realized ? undefined : "2 2"} />
            )
          ) : (
            <rect x={x1} y={cy - 6} width={x2 - x1} height={12} rx={3} fill={f.realized ? fill : "#FFFFFF"} fillOpacity={f.realized ? 0.85 : 1} stroke={isSelF ? C.selection : stroke} strokeWidth={isSelF ? 2.4 : 1.4} strokeDasharray={f.realized ? undefined : "4 3"} />
          )}
          {f.realized && f.proof === "pendente" && <circle cx={(point ? x1 : x2) + 5} cy={cy - 6} r={3.5} fill="#FFF4D6" stroke={C.amber} />}
          <text x={(point ? x1 + 10 : x2 + 8)} y={cy + 4} fontSize={10.5} fontWeight={600} fill={proven ? C.paid : C.text2}>{label}</text>
          <title>{titleText}</title>
        </g>,
      )
    }
    let sx = Math.max(startX, rightmost + 14)
    return (
      <g opacity={dim ? 0.35 : 1}>
        {parts}
        {summaries.map((s) => {
          const x = sx
          sx += textWidth(s.text, 11) + 22
          return (
            <g key={`s${s.f.id}`} data-hit="fin" data-id={s.f.id} style={{ cursor: "pointer" }}>
              <rect x={x - 4} y={cy - 9} width={textWidth(s.text, 11) + 10} height={18} rx={4} fill={selectedFin === s.f.id ? "#E6F2FA" : "#FFFFFF"} fillOpacity={0.94} stroke={selectedFin === s.f.id ? C.selection : "#E2E8F0"} />
              <text x={x + 1} y={cy + 4} fontSize={11} fontWeight={600} fill={s.tone}>{s.text}</text>
              <title>{`${s.f.name}${s.f.notes ? `\n${s.f.notes}` : ""}`}</title>
            </g>
          )
        })}
      </g>
    )
  }

  function AnnotationShape({ a }: { a: Annotation }) {
    const linked = a.linkedItemId ? byId.get(a.linkedItemId) : undefined
    let day: number
    let rowY: number
    let anchor: { x: number; y: number } | null = null
    if (linked) {
      const row = layout.rowOf(linked.id)
      if (!row) return null
      day = linked.range.start + (a.offsetDays ?? 0)
      rowY = row.top + a.y
      anchor = { x: X(Math.min(linked.range.end, Math.max(linked.range.start, day))), y: Y(row.top) + row.h / 2 }
    } else if (a.linkedItemId) return null
    else {
      day = toDay(a.date)
      rowY = a.y
    }
    const x = X(day)
    const y = Y(rowY)
    const isSelA = selectedAnnotation === a.id
    if (a.kind === "marker") {
      return (
        <g>
          <line x1={x} x2={x} y1={BODY_TOP} y2={size.h} stroke={C.amber} strokeDasharray="1 3" />
          <g data-hit="ann" data-id={a.id} style={{ cursor: "move" }} transform={`translate(${x},${y})`}>
            <path d="M0,0 L0,22 M0,0 L14,5 L0,10" stroke={C.amber} strokeWidth={2} fill={C.amber} />
            <text x={18} y={10} fontSize={12} fontWeight={600} fill={C.text}>{a.text}</text>
            {isSelA && <rect x={-4} y={-4} width={30 + textWidth(a.text)} height={30} fill="none" stroke={C.selection} strokeDasharray="3 2" />}
          </g>
        </g>
      )
    }
    if (a.kind === "highlight") {
      const wpx = Math.max(20, (a.width ?? 90) * ppd)
      return (
        <g data-hit="ann" data-id={a.id} style={{ cursor: "move" }}>
          <rect x={x} y={BODY_TOP} width={wpx} height={bodyH} fill="#F6C343" fillOpacity={0.12} stroke={isSelA ? C.selection : C.amber} strokeOpacity={0.6} strokeDasharray="4 3" />
          <text x={x + 6} y={y + 14} fontSize={12} fontWeight={600} fill={C.text}>{a.text}</text>
        </g>
      )
    }
    const width = a.width ?? 200
    const lines = wrapText(a.text, width - 22)
    const hh = lines.length * 16 + 14
    const pal = a.kind === "note" ? { bg: "#FFF8DB", bd: "#E3C25C" } : a.kind === "comment" ? { bg: "#EEF5FB", bd: "#9CC3DE" } : { bg: "#FFFFFF", bd: a.color ?? C.navy }
    return (
      <g>
        {anchor && <path d={`M${x + 12},${y + hh} L${anchor.x},${anchor.y}`} stroke={pal.bd} strokeWidth={1.3} fill="none" markerEnd="url(#arrow)" pointerEvents="none" />}
        <g data-hit="ann" data-id={a.id} transform={`translate(${x},${y})`} style={{ cursor: "move" }}>
          <rect width={width} height={hh} rx={a.kind === "comment" ? 10 : 4} fill={pal.bg} stroke={isSelA ? C.selection : pal.bd} strokeWidth={isSelA ? 2 : 1} />
          {a.kind === "callout" && <rect width={3} height={hh} fill={pal.bd} />}
          {lines.map((ln, i) => (
            <text key={i} x={12} y={20 + i * 16} fontSize={12} fontWeight={a.kind === "callout" ? 600 : 500} fill={C.text}>{ln}</text>
          ))}
        </g>
      </g>
    )
  }
}

const FONT_FAMILY: Record<string, string> = {
  inter: "Inter, system-ui, sans-serif",
  display: "Inter Tight, Inter, sans-serif",
  mono: "JetBrains Mono, monospace",
  serif: "Georgia, serif",
}

const TAG_PALETTE: Record<Tag["tone"], { bg: string; fg: string; bd: string }> = {
  paid: { bg: "#E7F4EE", fg: "#1C6B4B", bd: "#9FD3BB" },
  pending: { bg: "#FFF3E6", fg: "#9A4A08", bd: "#F6C99A" },
  plan: { bg: "#F1F4F8", fg: "#475569", bd: "#CBD5E1" },
  neutral: { bg: "#F1F4F8", fg: "#475569", bd: "#CBD5E1" },
  scenario: { bg: "#EEF0FB", fg: "#3730A3", bd: "#B9BEF0" },
  warn: { bg: "#FFF8DB", fg: "#6B4E00", bd: "#E3C25C" },
  info: { bg: "#E8F3FA", fg: "#0B5F8C", bd: "#A9D2EA" },
}

const STEP_SHORT: Record<string, string> = {
  planejamento: "planejamento",
  negociacao: "negociação concluída",
  proposta: "proposta recebida",
  contrato: "contrato",
  nf: "NF emitida",
  pagamento: "pagamento",
  comprovacao: "comprovação",
}

/** Histórico / Ciclo atual / Proposta futura — computed from the cycle and the reference date. */
function projectRole(it: EffItem | undefined, ref: number) {
  if (!it) return "Ações sem projeto"
  if (it.certainty === "hipotese" || it.range.start > ref) return "Proposta futura"
  if (it.range.end <= ref) return "Histórico"
  return "Ciclo atual"
}

/** First label that fits the available width. */
const pickFit = (labels: string[], room: number) => labels.find((l) => textWidth(l, 11.5) < room) ?? labels[labels.length - 1]

const st0 = (it: EffItem) => it.certainty === "hipotese" || it.certainty === "a_validar" || it.certainty === "planejado"

function StatusGlyph({ x, y, status, pending, color }: { x: number; y: number; status: StatusKey; pending: boolean; color: string }) {
  return (
    <g pointerEvents="none">
      {status === "concluido" ? (
        <>
          <circle cx={x} cy={y} r={6} fill={C.green} />
          <path d={`M${x - 3},${y} l2,2.5 l4,-4.5`} stroke="#fff" strokeWidth={1.6} fill="none" />
        </>
      ) : status === "execucao" || status === "previsto" || status === "encerrado" ? (
        <circle cx={x} cy={y} r={5} fill={color} fillOpacity={status === "encerrado" ? 0.6 : 1} />
      ) : status === "planejado" ? (
        <circle cx={x} cy={y} r={5} fill="#fff" stroke={color} strokeWidth={1.8} />
      ) : status === "cenario" ? (
        <circle cx={x} cy={y} r={5} fill="#fff" stroke={color} strokeWidth={1.6} strokeDasharray="2 2" />
      ) : (
        <circle cx={x} cy={y} r={5} fill="#E4E9F0" stroke="#AEBAC8" />
      )}
      {pending && (
        <g>
          <circle cx={x + 5} cy={y - 5} r={4} fill="#FFF4D6" stroke={C.amber} strokeWidth={1} />
          <text x={x + 5} y={y - 2.6} fontSize={6.5} fontWeight={900} fill={C.amber} textAnchor="middle">!</text>
        </g>
      )}
    </g>
  )
}

function HoverCard({ item, x, y, hyp, w, refDay, docVig, label, doc, fins }: { item: EffItem; x: number; y: number; hyp?: boolean; w: number; refDay: number; docVig: DayRange | null; label: string; doc: StudioDoc; fins: FinRecord[] }) {
  const acq = fins.find((f) => f.kind === "aquisicao" && f.actionId === item.id)
  const paid = acq ? paidOf(fins, acq).total : null
  const brlv = (v: number | null | undefined) => (v == null ? "não informado" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }))
  const plannedDoc = item.finance?.planned != null && (item.finance.status === "comprovado" || item.finance.status === "formalizado") ? item.finance.planned : null
  const project = doc.projects.find((p) => p.id === item.projectId)
  const turmas = turmasOf(doc, item)
  const sources = item.sourceIds.map((sid) => doc.sources.find((x) => x.id === sid)?.title).filter(Boolean) as string[]
  const range = item.kind === "vigencia" && item.baseRange && !hyp ? item.baseRange : item.range
  const st = statusOf({ ...item, range }, refDay)
  const after = docVig && item.kind !== "vigencia" && item.kind !== "projeto" && item.kind !== "planejamento" && !item.dateUndetermined ? partAfter(range, docVig) : null
  return (
    <div className="pointer-events-none absolute z-30 w-[290px] rounded-lg border bg-white p-3 text-[12px] leading-snug shadow-xl shadow-slate-900/10" style={{ left: Math.min(Math.max(8, x - 20), w - 300), top: y + 4 }}>
      <div className="font-semibold text-foreground">{hyp ? `${item.name} — cenário` : item.name}</div>
      {item.kind === "curso" && <div className="text-[11.5px] font-medium text-primary">{label}</div>}
      {item.kind !== "curso" && item.shortName && <div className="text-[11.5px] text-muted-foreground">{shortNameOf(item)}</div>}
      <div className="text-muted-foreground">{KIND_LABEL[item.kind]} · {st.label}</div>
      <div className="mt-1.5 font-medium text-foreground">
        {item.dateUndetermined ? `Período geral ${item.start.slice(0, 4)}–${item.end.slice(0, 4)} · datas específicas a validar` : `${fmtDate(fromDay(range.start))} – ${fmtDate(fromDay(range.end - 1))}`}
      </div>
      {!item.dateUndetermined && <div className="text-muted-foreground">{calendarMonthsTouched(range)} meses-calendário · {lengthDays(range)} dias</div>}
      {after && <div className="mt-1.5 font-semibold text-[#9A4A08]">{calendarMonthsTouched(after)} meses-calendário após a vigência de referência ({fmtMonthsSpan(after)}). Cobertura a verificar na documentação.</div>}
      {item.kind === "vigencia" && item.baseRange && <div className="mt-1.5 text-navy">{hyp ? "Hipótese de cenário — não representa aprovação." : "Referência documental — a validar."}</div>}
      {!["vigencia", "projeto", "planejamento", "marco"].includes(item.kind) && (
        <div className="mt-2 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 border-t pt-1.5 text-[11.5px]">
          <span className="text-muted-foreground">Tempo</span>
          <span className="font-medium">{TEMPORAL_LABEL[temporalSituation(range, docVig, item.dateUndetermined).key]}</span>
          <span className="text-muted-foreground">Financeiro</span>
          <span className="font-medium">{FIN_LABEL[item.finSituation ?? "pendente"]}</span>
        </div>
      )}
      <div className="mt-2 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 border-t pt-1.5 text-[11.5px]">
        <span className="text-muted-foreground">Projeto</span><span className="font-medium">{project ? `${project.name} · ${project.phase}` : "—"}</span>
        {(item.kind === "curso" || turmas.length > 0) && <><span className="text-muted-foreground">Turma</span><span className="font-medium">{turmas.map((t) => t.name).join(", ") || "a identificar"}</span></>}
        {!["vigencia", "projeto", "planejamento", "marco"].includes(item.kind) && (
          <>
            <span className="text-muted-foreground">Previsto</span><span>{plannedDoc != null ? brlv(plannedDoc) : "não documentado"}</span>
            <span className="text-muted-foreground">Contratado</span><span>{acq ? brlv(acq.contractValue) : "sem aquisição registrada"}</span>
            <span className="text-muted-foreground">Pago</span><span>{acq ? brlv(paid) : "—"}</span>
            {acq?.contractValue != null && paid != null && <><span className="text-muted-foreground">Saldo</span><span>{brlv(acq.contractValue - paid)}</span></>}
            {acq && <><span className="text-muted-foreground">Aquisição</span><span>{ACQ_STATUS_LABEL[acq.acqStatus ?? "planejado"]} · {PROOF_LABEL[acq.proof].toLowerCase()}</span></>}
          </>
        )}
        <span className="text-muted-foreground">Fonte</span><span className="line-clamp-2">{sources.join("; ") || "não informada"}</span>
      </div>
      {st.pending && <div className="mt-1.5 text-[#8a5a10]">Informação a validar na documentação.</div>}
    </div>
  )
}

export function exportSvgString(): string | null {
  const svg = document.getElementById("timeline-svg") as SVGSVGElement | null
  if (!svg) return null
  const clone = svg.cloneNode(true) as SVGSVGElement
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg")
  clone.removeAttribute("style")
  clone.setAttribute("font-family", "Inter, Arial, sans-serif")
  return new XMLSerializer().serializeToString(clone)
}
