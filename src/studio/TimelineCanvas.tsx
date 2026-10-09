import { useEffect, useMemo, useRef, useState } from "react"
import {
  addMonths, calendarMonthsTouched, dayOf, fmtDate, fmtMonthsSpan, fromDay, lengthDays, monthShort, partAfter, snapBoundary, toDay, ymd,
  type DayRange,
} from "@/lib/dates"
import type { EffItem } from "@/lib/analysis"
import { computeRows, BAR_H, LABEL_W, type Row } from "@/lib/layout"
import { C, barStyleFor, itemColor, statusOf, textWidth, truncate, wrapText, type StatusKey } from "@/lib/visual"
import { reorderRows, useStudio, uid } from "@/store/store"
import { useCompareItems, useEffectiveItems, useProjectColor } from "@/store/hooks"
import { useView } from "@/store/view"
import { GROUPS, KIND_LABEL, type Annotation, type GroupId } from "@/data/types"
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
      drop: { group: GroupId; index: number; lineY: number } | null
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
  const view = useView()
  const colorOf = useProjectColor()
  const wrapRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const gesture = useRef<Gesture | null>(null)
  const [size, setSize] = useState({ w: 1200, h: 600 })
  const [, force] = useState(0)
  const [hover, setHover] = useState<{ id: string; x: number; y: number; hyp?: boolean } | null>(null)
  const [dragHint, setDragHint] = useState<{ x: number; y: number; lines: string[] } | null>(null)
  const [spaceDown, setSpaceDown] = useState(false)
  const fitted = useRef(false)

  const { settings } = doc
  const visible = useMemo(() => items.filter((i) => !i.hidden), [items])
  const layout = useMemo(
    () =>
      computeRows(visible, {
        hidden: settings.groupsHidden ?? [],
        collapsed: settings.groupsCollapsed ?? [],
        detailed: settings.groupsDetailed ?? [],
        detailAll: view.detailAll,
      }),
    [visible, settings.groupsHidden, settings.groupsCollapsed, settings.groupsDetailed, view.detailAll],
  )
  const projects = visible.filter((i) => i.kind === "projeto")
  const vig = visible.find((i) => i.kind === "vigencia" && i.projectId === "p2") ?? visible.find((i) => i.kind === "vigencia")
  const docVig: DayRange | null = vig ? (vig.baseRange ?? vig.range) : null
  const hypVig: DayRange | null = vig?.baseRange ? vig.range : null
  const refDay = toDay(settings.referenceDate)
  const filter = view.projectFilter
  const dimmed = (it: EffItem) => filter.length > 0 && !filter.includes(it.projectId ?? "")

  // ── Measure; first open shows 2025–2028 ──────────────────────────────────
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => {
      const w = Math.floor(e.contentRect.width)
      const h = Math.floor(e.contentRect.height)
      if (!w || !h) return
      setSize({ w, h })
      useView.getState().set({ width: Math.max(200, w - LABEL_W) })
      const r = useView.getState().range
      if (!fitted.current) {
        fitted.current = true
        useView.getState().setRange(r?.from ?? 2025, r?.to ?? 2028)
      } else if (r) useView.getState().fit(dayOf(r.from, 1), dayOf(r.to + 1, 1))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const { x0, pxPerDay: ppd, scrollY } = view
  const ppy = ppd * 365.25
  const showSem = ppy >= 90
  const showQuarters = ppy >= 900
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
    setHover(null)

    if (kind === "g-collapse") return toggleGroup("groupsCollapsed", id as GroupId)
    if (kind === "g-detail") return toggleGroup("groupsDetailed", id as GroupId)
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
      const hits = layout.rows
        .filter((r): r is Extract<Row, { type: "item" }> => r.type === "item")
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
          st.live((d) => reorderRows(d, st.scenarioId, g.anchor, drop.group, layout.orderOf(drop.group), drop.index))
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
        onDoubleClick={(e) => {
          const hit = (e.target as Element).closest<SVGElement>("[data-hit]")
          const k = hit?.dataset.hit
          if (k === "item" || k === "item-static" || k === "label") useStudio.getState().setEditing(hit?.dataset.id ?? null)
        }}
      >
        <defs>
          <pattern id="stripe-after" patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(45)">
            <rect width="8" height="8" fill={C.red} />
            <line x1="0" y1="0" x2="0" y2="8" stroke="#FFFFFF" strokeWidth="2" strokeOpacity="0.28" />
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
          {docVig && <rect x={X(docVig.end)} y={BODY_TOP} width={Math.max(0, size.w - X(docVig.end))} height={bodyH} fill={C.redSoft} />}
          {layout.rows.map((r, i) =>
            r.type === "group" ? (
              <rect key={`gb${i}`} x={LABEL_W} y={Y(r.top)} width={timeW} height={r.h} fill="#FFFFFF" fillOpacity={0.6} />
            ) : r.type === "item" && r.index % 2 === 1 && !r.virtual ? (
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
            layout.rows.map((r, i) => {
              if (r.type !== "item" || r.virtual) return null
              const c = compareMap.get(r.item.id)
              if (!c || (c.range.start === r.item.range.start && c.range.end === r.item.range.end)) return null
              return (
                <rect key={`cmp${i}`} x={X(c.range.start)} y={Y(r.top) + (r.h - BAR_H) / 2 - 2} width={Math.max(2, (c.range.end - c.range.start) * ppd)} height={BAR_H + 4} rx={4}
                  fill="none" stroke="#7C5CC4" strokeWidth={1.5} strokeDasharray="3 3" pointerEvents="none" />
              )
            })}

          {layout.rows.map((r, i) => {
            if (r.type !== "item") return null
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
          {hypVig && <line x1={X(hypVig.end)} x2={X(hypVig.end)} y1={BODY_TOP} y2={size.h} stroke={C.navy} strokeWidth={2} strokeDasharray="7 5" pointerEvents="none" />}
          {docVig && <line x1={X(docVig.end)} x2={X(docVig.end)} y1={BODY_TOP} y2={size.h} stroke={C.red} strokeWidth={2.5} pointerEvents="none" />}

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
              <text fill={C.red} fontSize={12.5}>↑ {fmtDate(fromDay(docVig.end - 1))} · encerramento da vigência de referência</text>
            </g>
          )}
          {hypVig && X(hypVig.end) > LABEL_W && X(hypVig.end) < size.w && (
            <g transform={`translate(${X(hypVig.end) + 6},${size.h - 14})`}>
              <text fill={C.navy}>┆ {fmtDate(fromDay(hypVig.end - 1))} · cenário simulado (não aprovado)</text>
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
                {isAfter && <rect x={X(m.day)} y={HEADER - MONTH_H - 4} width={w} height={MONTH_H} fill={C.redSoft} />}
                {m.label && (
                  <text x={X(m.day) + w / 2} y={HEADER - 9} fontSize={9.5} fontFamily="JetBrains Mono, monospace" fill={docVig && m.day === docVig.end ? C.red : "#8796A8"} fontWeight={docVig && m.day === docVig.end ? 800 : 500} textAnchor="middle">
                    {m.label}
                  </text>
                )}
              </g>
            )
          })}
          {weeks.map((d) => (
            <line key={`wk${d}`} x1={X(d)} x2={X(d)} y1={HEADER - 4} y2={HEADER} stroke="#C9D3DE" />
          ))}
          {docVig && <line x1={X(docVig.end)} x2={X(docVig.end)} y1={PROJ_H + YEAR_H} y2={HEADER} stroke={C.red} strokeWidth={2.5} />}
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

      {/* Vertical scrollbar */}
      {maxScroll > 0 && (
        <div className="pointer-events-none absolute right-1 w-1.5 rounded-full bg-black/5" style={{ top: HEADER + 4, bottom: 12 }}>
          <div className="absolute w-1.5 rounded-full bg-black/20" style={{ top: `${(scrollY / (layout.total + 60)) * 100}%`, height: `${Math.min(100, (bodyH / (layout.total + 60)) * 100)}%` }} />
        </div>
      )}

      {/* Hover card: full details live here, not on the bar */}
      {hover && hoverItem && !dragHint && (
        <HoverCard item={hoverItem} x={hover.x} y={hover.y} hyp={hover.hyp} w={size.w} refDay={refDay} docVig={docVig} />
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
    if (r.type === "group") {
      const g = GROUPS.find((x) => x.id === r.group)!
      const color = GROUP_COLOR[r.group]
      return (
        <g>
          <g data-hit="g-collapse" data-id={r.group} style={{ cursor: "pointer" }}>
            <rect x={0} y={y} width={LABEL_W} height={r.h} fill="#FFFFFF" />
            <path d={r.collapsed ? `M14,${y + 13} l5,4 l-5,4` : `M12,${y + 15} l4,5 l4,-5`} fill="none" stroke={color} strokeWidth={1.8} />
            <text x={28} y={y + 21.5} fontSize={11.5} fontWeight={800} letterSpacing={1.1} fill={color}>
              {g.code} · {g.label.toUpperCase()}
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
    const by = cy - BAR_H / 2
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
    const bs = barStyleFor(status, color)
    const hitKind = docRow ? "item-static" : "item"
    const enter = (e: React.PointerEvent) => !gesture.current && setHover({ id: it.id, x: local(e).x, y: top + r.h, hyp: r.virtual === "hyp" })
    const leave = () => setHover((h) => (h?.id === it.id ? null : h))

    // Historic action without a dated source: an approximate interval, never a solid bar.
    if (it.dateUndetermined) {
      const mid = (Math.max(x1, LABEL_W) + Math.min(x2, size.w)) / 2
      const label = "data a validar"
      return (
        <g opacity={dim ? 0.3 : 1} onPointerEnter={enter} onPointerLeave={leave}>
          <rect data-hit="item" data-id={it.id} x={x1} y={by} width={w} height={BAR_H} fill="transparent" style={{ cursor: "grab" }} />
          <line x1={x1} x2={x2} y1={cy} y2={cy} stroke={C.plan} strokeWidth={2} strokeDasharray="2 4" pointerEvents="none" />
          <line x1={x1} x2={x1} y1={cy - 6} y2={cy + 6} stroke={C.plan} strokeWidth={2} pointerEvents="none" />
          <line x1={x2} x2={x2} y1={cy - 6} y2={cy + 6} stroke={C.plan} strokeWidth={2} pointerEvents="none" />
          <g pointerEvents="none">
            <rect x={mid - 52} y={cy - 10} width={104} height={20} rx={10} fill="#FFFFFF" stroke="#C9D3DE" />
            <text x={mid} y={cy + 4} fontSize={11} fontWeight={600} fill={C.text2} textAnchor="middle">{label}</text>
          </g>
          {isSel && <rect x={x1 - 2} y={by - 2} width={w + 4} height={BAR_H + 4} rx={4} fill="none" stroke={C.selection} strokeWidth={2} pointerEvents="none" />}
        </g>
      )
    }

    if (it.kind === "marco") {
      return (
        <g opacity={dim ? 0.3 : 1} onPointerEnter={enter} onPointerLeave={leave}>
          <path data-hit="item" data-id={it.id} d={`M${x1},${cy - 9} L${x1 + 9},${cy} L${x1},${cy + 9} L${x1 - 9},${cy} Z`} fill={st0(it) ? "#FFFFFF" : C.navy} stroke={C.navy} strokeWidth={2} style={{ cursor: "grab" }} />
          <text x={x1 + 15} y={cy + 4} fontSize={12} fontWeight={600} fill={C.text} pointerEvents="none">{fmtDate(it.start)}</text>
          {isSel && <circle cx={x1} cy={cy} r={14} fill="none" stroke={C.selection} strokeWidth={2} pointerEvents="none" />}
        </g>
      )
    }

    // Part after the documental vigência (calendar fact — not a statement about coverage).
    const after = docVig && !r.virtual && !docRow && it.kind !== "vigencia" && it.kind !== "projeto" && it.kind !== "planejamento" ? partAfter(range, docVig) : null
    const afterMonths = after ? calendarMonthsTouched(after) : 0
    const afterW = after ? X(after.end) - X(after.start) : 0
    const shortDates = `${shortMonth(range.start)} – ${shortMonth(range.end - 1)}`
    const innerLabel =
      r.virtual ? `até ${fmtDate(fromDay(range.end - 1))} · cenário`
      : docRow ? `até ${fmtDate(fromDay(range.end - 1))} · referência documental`
      : it.kind === "vigencia" ? `até ${fmtDate(fromDay(range.end - 1))}`
      : shortDates
    const innerW = (after ? X(after.start) : x2) - Math.max(x1, LABEL_W) - 16
    const fitsInside = textWidth(innerLabel, 11.5) < innerW
    const narrow = w < 12
    const showAfterLabel = after && (it.kind === "curso" || it.kind === "turma" || isSel)

    return (
      <g opacity={dim ? 0.3 : 1} onPointerEnter={enter} onPointerLeave={leave}>
        {it.baseRange && r.virtual === undefined && !docRow && (
          <rect x={X(it.baseRange.start)} y={by - 2} width={Math.max(2, (it.baseRange.end - it.baseRange.start) * ppd)} height={BAR_H + 4} rx={4}
            fill="none" stroke={C.text3} strokeDasharray="2 3" pointerEvents="none" />
        )}
        {narrow ? (
          <>
            <circle data-hit={hitKind} data-id={it.id} cx={x1 + w / 2} cy={cy} r={6} fill={bs.fill} stroke={bs.stroke} strokeWidth={1.5} style={{ cursor: "grab" }} />
            <text x={x1 + w / 2 + 11} y={cy + 4} fontSize={11.5} fill={C.text2} pointerEvents="none">{shortDates}</text>
          </>
        ) : (
          <rect data-hit={hitKind} data-id={it.id} x={x1} y={by} width={w} height={BAR_H} rx={3}
            fill={bs.fill} fillOpacity={bs.fillOpacity} stroke={bs.stroke} strokeWidth={bs.strokeWidth} strokeDasharray={bs.dash}
            style={{ cursor: it.locked || docRow ? "pointer" : "grab" }} />
        )}
        {after && !narrow && (
          <rect x={X(after.start)} y={by} width={Math.max(2, afterW)} height={BAR_H} rx={3} fill={status === "cenario" ? "#FFFFFF" : "url(#stripe-after)"}
            stroke={C.red} strokeWidth={status === "cenario" ? 1.6 : 0} strokeDasharray={status === "cenario" ? "6 4" : undefined} pointerEvents="none" />
        )}
        {!narrow && (fitsInside ? (
          <text x={Math.max(x1, LABEL_W) + 9} y={cy + 4} fontSize={11.5} fontWeight={600} fill={bs.text} pointerEvents="none">{innerLabel}</text>
        ) : !after && x2 + 8 + textWidth(innerLabel, 11.5) < size.w ? (
          <text x={x2 + 8} y={cy + 4} fontSize={11.5} fill={C.text2} pointerEvents="none">{innerLabel}</text>
        ) : null)}
        {status === "concluido" && w > 30 && <path d={`M${x2 - 18},${cy} l4,4 l8,-8`} stroke="#FFFFFF" strokeWidth={2} fill="none" pointerEvents="none" />}
        {after && afterW > 56 && (
          <text x={X(after.start) + afterW / 2} y={cy + 4} fontSize={11.5} fontWeight={700} fill={status === "cenario" ? C.red : "#FFFFFF"} textAnchor="middle" pointerEvents="none">
            {afterW > 150 ? `${afterMonths} meses após a vigência` : `+${afterMonths} m`}
          </text>
        )}
        {showAfterLabel && afterW <= 56 && (
          <text x={X(after!.end) + 8} y={cy + 4} fontSize={11.5} fontWeight={700} fill={C.red} pointerEvents="none">+{afterMonths} meses após a vigência</text>
        )}
        {it.changed && !docRow && (
          <g pointerEvents="none" transform={`translate(${x1},${by - 9})`}>
            <rect width={50} height={12} rx={2} fill={C.navy} />
            <text x={25} y={9} fontSize={8.5} fontWeight={800} textAnchor="middle" fill="#FFFFFF" letterSpacing={0.6}>CENÁRIO</text>
          </g>
        )}
        {isSel && (
          <>
            <rect x={x1 - 2} y={by - 2} width={w + 4} height={BAR_H + 4} rx={4} fill="none" stroke={C.selection} strokeWidth={2} pointerEvents="none" />
            {!it.locked && !docRow && !narrow && (
              <>
                <rect data-hit="item-l" data-id={it.id} x={x1 - 4} y={by + 4} width={8} height={BAR_H - 8} rx={2} fill="#FFFFFF" stroke={C.selection} strokeWidth={1.5} style={{ cursor: "ew-resize" }} />
                <rect data-hit="item-r" data-id={it.id} x={x2 - 4} y={by + 4} width={8} height={BAR_H - 8} rx={2} fill="#FFFFFF" stroke={C.selection} strokeWidth={1.5} style={{ cursor: "ew-resize" }} />
              </>
            )}
          </>
        )}
        {!isSel && !it.locked && !docRow && !narrow && w > 16 && (
          <>
            <rect data-hit="item-l" data-id={it.id} x={x1 - 3} y={by} width={7} height={BAR_H} fill="transparent" style={{ cursor: "ew-resize" }} />
            <rect data-hit="item-r" data-id={it.id} x={x2 - 4} y={by} width={7} height={BAR_H} fill="transparent" style={{ cursor: "ew-resize" }} />
          </>
        )}
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

function HoverCard({ item, x, y, hyp, w, refDay, docVig }: { item: EffItem; x: number; y: number; hyp?: boolean; w: number; refDay: number; docVig: DayRange | null }) {
  const range = item.kind === "vigencia" && item.baseRange && !hyp ? item.baseRange : item.range
  const st = statusOf({ ...item, range }, refDay)
  const after = docVig && item.kind !== "vigencia" && item.kind !== "projeto" && item.kind !== "planejamento" && !item.dateUndetermined ? partAfter(range, docVig) : null
  return (
    <div className="pointer-events-none absolute z-30 w-[290px] rounded-lg border bg-white p-3 text-[12px] leading-snug shadow-xl shadow-slate-900/10" style={{ left: Math.min(Math.max(8, x - 20), w - 300), top: y + 4 }}>
      <div className="font-semibold text-foreground">{hyp ? `${item.name} — cenário` : item.name}</div>
      <div className="text-muted-foreground">{KIND_LABEL[item.kind]} · {st.label}</div>
      <div className="mt-1.5 font-medium text-foreground">
        {item.dateUndetermined ? `Período geral ${item.start.slice(0, 4)}–${item.end.slice(0, 4)} · datas específicas a validar` : `${fmtDate(fromDay(range.start))} – ${fmtDate(fromDay(range.end - 1))}`}
      </div>
      {!item.dateUndetermined && <div className="text-muted-foreground">{calendarMonthsTouched(range)} meses-calendário · {lengthDays(range)} dias</div>}
      {after && <div className="mt-1.5 font-semibold text-destructive">{calendarMonthsTouched(after)} meses-calendário após a vigência de referência ({fmtMonthsSpan(after)}). Cobertura a verificar na documentação.</div>}
      {item.kind === "vigencia" && item.baseRange && <div className="mt-1.5 text-navy">{hyp ? "Hipótese de cenário — não representa aprovação." : "Referência documental — a validar."}</div>}
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
