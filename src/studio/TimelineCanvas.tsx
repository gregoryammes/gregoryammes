import { useEffect, useMemo, useRef, useState } from "react"
import {
  addMonths, calendarMonthsTouched, dayOf, fmtDate, fromDay, lengthDays, monthShort, snapBoundary, toDay, ymd,
  type DayRange,
} from "@/lib/dates"
import { computeOverruns, type EffItem } from "@/lib/analysis"
import { computeRows, HEADER_H, LABEL_W, ROW_H, RULER_H, COLLAPSED_H } from "@/lib/layout"
import { BRAND, barStyle, itemColor, truncate, wrapText } from "@/lib/visual"
import { useStudio, uid } from "@/store/store"
import { useCompareItems, useEffectiveItems, useProjectColor } from "@/store/hooks"
import { useView } from "@/store/view"
import type { Annotation } from "@/data/types"

type Gesture =
  | {
      type: "move"
      anchor: string
      ids: string[]
      sx: number
      sy: number
      orig: Record<string, { start: number; end: number; lane: number }>
      began: boolean
      temporalReady: boolean
      clickSelect: string | null
    }
  | { type: "resize-l" | "resize-r"; id: string; sx: number; orig: { start: number; end: number }; began: boolean }
  | { type: "pan"; sx: number; sy: number; x0: number; scrollY: number; moved: boolean }
  | { type: "marquee"; sx: number; sy: number; cx: number; cy: number; additive: boolean }
  | { type: "ann"; id: string; sx: number; sy: number; date: number; y: number; offset: number; linked: boolean; began: boolean }

interface Hint {
  x: number
  y: number
  lines: string[]
}

const LOWER_TIER = (ppd: number) => (ppd < 1.1 ? "quarter" : ppd < 5 ? "month" : ppd < 16 ? "week" : "day")

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
  const [hint, setHint] = useState<Hint | null>(null)
  const [hover, setHover] = useState<string | null>(null)
  const [spaceDown, setSpaceDown] = useState(false)
  const fitted = useRef(false)

  const { settings } = doc
  const visible = useMemo(() => items.filter((i) => !i.hidden), [items])
  const rows = useMemo(() => computeRows(visible, settings.layersHidden, settings.layersCollapsed), [visible, settings.layersHidden, settings.layersCollapsed])
  const overruns = useMemo(() => computeOverruns(items), [items])
  const vigencias = visible.filter((i) => i.kind === "vigencia")
  const refDay = toDay(settings.referenceDate)
  const filter = view.projectFilter
  const dimmed = (it: EffItem) => filter.length > 0 && !filter.includes(it.projectId ?? "")

  // ── Measure ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => {
      const w = Math.floor(e.contentRect.width)
      const h = Math.floor(e.contentRect.height)
      setSize({ w, h })
      useView.getState().set({ width: Math.max(200, w - LABEL_W) })
      if (!fitted.current && w > 0) {
        fitted.current = true
        useView.getState().fit(dayOf(2023, 1), dayOf(2031, 1))
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const { x0, pxPerDay: ppd, scrollY } = view
  const X = (day: number) => LABEL_W + (day - x0) * ppd
  const dayAt = (px: number) => x0 + (px - LABEL_W) / ppd
  const Y = (rowY: number) => RULER_H + rowY - scrollY
  const visStart = Math.floor(dayAt(LABEL_W)) - 2
  const visEnd = Math.ceil(dayAt(size.w)) + 2
  const bodyH = Math.max(0, size.h - RULER_H)
  const maxScroll = Math.max(0, rows.total - bodyH + 40)

  // ── Space-to-pan + keyboard shortcuts ────────────────────────────────────
  useEffect(() => {
    const isField = (t: EventTarget | null) => t instanceof HTMLElement && (t.closest("input,textarea,select,[contenteditable]") !== null)
    const down = (e: KeyboardEvent) => {
      if (isField(e.target) || useStudio.getState().mode !== "studio") return
      const st = useStudio.getState()
      const mod = e.metaKey || e.ctrlKey
      if (e.code === "Space") {
        setSpaceDown(true)
        e.preventDefault()
        return
      }
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault()
        if (e.shiftKey) st.redo()
        else st.undo()
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault()
        st.redo()
      } else if (mod && e.key.toLowerCase() === "c") st.copy()
      else if (mod && e.key.toLowerCase() === "v") st.paste()
      else if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault()
        st.duplicateItems(st.selection)
      } else if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault()
        st.save()
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (st.selectedAnnotation) {
          if (window.confirm("Excluir a anotação selecionada?")) st.deleteAnnotation(st.selectedAnnotation)
        } else if (st.selection.length && window.confirm(`Excluir ${st.selection.length} elemento(s)? (é possível desfazer)`)) {
          st.deleteItems(st.selection)
        }
      } else if (e.key === "Escape") {
        st.select([])
        useView.getState().set({ connectFrom: null, tool: "select" })
      } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        if (!st.selection.length) return
        e.preventDefault()
        nudge(e.key === "ArrowRight" ? 1 : -1, e.shiftKey)
      } else if (!mod && e.key === "v") useView.getState().set({ tool: "select" })
      else if (!mod && e.key === "h") useView.getState().set({ tool: "hand" })
      else if (!mod && e.key === "n") useView.getState().set({ tool: "note" })
      else if (!mod && e.key === "c") useView.getState().set({ tool: "connect", connectFrom: null })
      else if (!mod && e.key === "f") fitAll()
    }
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") setSpaceDown(false)
    }
    window.addEventListener("keydown", down)
    window.addEventListener("keyup", up)
    return () => {
      window.removeEventListener("keydown", down)
      window.removeEventListener("keyup", up)
    }
  })

  function fitAll() {
    if (!visible.length) return
    useView.getState().fit(Math.min(...visible.map((i) => i.range.start)), Math.max(...visible.map((i) => i.range.end)))
  }

  /** Keyboard nudge: one snap unit (or a day without snap); Shift = one month. */
  function nudge(dir: number, big: boolean) {
    const st = useStudio.getState()
    const unit = big ? "month" : settings.snap === "none" ? "day" : settings.snap
    const sel = visible.filter((i) => st.selection.includes(i.id) && !i.locked)
    if (!sel.length) return
    if (!st.prepareEdit(sel[0].id, true)) return
    const patches: Record<string, { start: string; end: string }> = {}
    for (const it of sel) {
      const len = it.range.end - it.range.start
      let ns: number
      if (unit === "day") ns = it.range.start + dir
      else if (unit === "week") ns = it.range.start + 7 * dir
      else if (unit === "quarter") ns = addMonths(snapBoundary(it.range.start, "month"), 3 * dir)
      else ns = addMonths(snapBoundary(it.range.start, "month"), dir)
      patches[it.id] = { start: fromDay(ns), end: fromDay(ns + len - 1) }
    }
    st.begin("deslocar (teclado)")
    st.livePatchItems(patches)
    st.end(`${dir > 0 ? "+" : "−"}1 ${unit}`)
  }

  // ── Wheel: pan by default, Ctrl/⌘ (or pinch) zooms at the cursor ─────────
  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const v = useView.getState()
      const rect = el.getBoundingClientRect()
      if (e.ctrlKey || e.metaKey || e.altKey) {
        v.zoomAt(Math.exp(-e.deltaY * 0.0022), e.clientX - rect.left - LABEL_W)
      } else {
        const dx = e.shiftKey ? e.deltaY : e.deltaX
        const dy = e.shiftKey ? 0 : e.deltaY
        v.set({
          x0: v.x0 + dx / v.pxPerDay,
          scrollY: Math.max(0, Math.min(maxScrollRef.current, v.scrollY + dy)),
        })
      }
    }
    el.addEventListener("wheel", onWheel, { passive: false })
    return () => el.removeEventListener("wheel", onWheel)
  }, [])
  const maxScrollRef = useRef(maxScroll)
  maxScrollRef.current = maxScroll

  // ── Pointer interactions ─────────────────────────────────────────────────
  const local = (e: React.PointerEvent | PointerEvent) => {
    const r = svgRef.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }
  const rowYAt = (y: number) => y - RULER_H + scrollY

  function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    const st = useStudio.getState()
    const v = useView.getState()
    const p = local(e)
    const hit = (e.target as Element).closest<SVGElement>("[data-hit]")
    const kind = hit?.dataset.hit
    const id = hit?.dataset.id ?? ""
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)

    if (e.button === 1 || spaceDown || v.tool === "hand" || (!hit && v.tool === "select" && !e.shiftKey)) {
      gesture.current = { type: "pan", sx: p.x, sy: p.y, x0: v.x0, scrollY: v.scrollY, moved: false }
      return
    }
    if (v.tool === "note") {
      const target = kind?.startsWith("item") ? visible.find((i) => i.id === id) : undefined
      const day = Math.round(dayAt(p.x))
      const rowTop = target ? rows.yOf(target) : null
      const a: Annotation = target && rowTop != null
        ? { id: uid("ann"), kind: "callout", text: "Nova anotação", date: fromDay(day), y: rowYAt(p.y) - rowTop - 44, linkedItemId: target.id, offsetDays: day - target.range.start, width: 200 }
        : { id: uid("ann"), kind: "note", text: "Nova anotação", date: fromDay(day), y: rowYAt(p.y), width: 200 }
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
          v.set({ connectFrom: null, tool: "select" })
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
      } else clickSelect = id // a click without drag on a multi-selection narrows it to this one
      const orig: Record<string, { start: number; end: number; lane: number }> = {}
      for (const i of visible) if (ids.includes(i.id) && !i.locked) orig[i.id] = { start: i.range.start, end: i.range.end, lane: i.lane }
      gesture.current = { type: "move", anchor: id, ids: Object.keys(orig), sx: p.x, sy: p.y, orig, began: false, temporalReady: false, clickSelect }
      return
    }
    // Shift-drag on empty canvas: marquee selection.
    gesture.current = { type: "marquee", sx: p.x, sy: p.y, cx: p.x, cy: p.y, additive: e.shiftKey }
  }

  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    const g = gesture.current
    const p = local(e)
    if (!g) return
    const st = useStudio.getState()
    const snap = settings.snap
    if (g.type === "pan") {
      const dx = p.x - g.sx
      const dy = p.y - g.sy
      if (Math.abs(dx) + Math.abs(dy) > 3) g.moved = true
      useView.getState().set({ x0: g.x0 - dx / ppd, scrollY: Math.max(0, Math.min(maxScroll, g.scrollY - dy)) })
      return
    }
    if (g.type === "marquee") {
      g.cx = p.x
      g.cy = p.y
      setHint({ x: 0, y: 0, lines: [] })
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
      const laneDelta = Math.abs(dy) > ROW_H * 0.6 ? Math.round(dy / ROW_H) : 0
      if (!g.began && delta === 0 && laneDelta === 0) return
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
      const patches: Record<string, { start?: string; end?: string; lane?: number }> = {}
      for (const id of g.ids) {
        const o = g.orig[id]
        const patch: { start?: string; end?: string; lane?: number } = { lane: Math.max(0, o.lane + laneDelta) }
        if (g.temporalReady) {
          patch.start = fromDay(o.start + delta)
          patch.end = fromDay(o.end + delta - 1)
        }
        patches[id] = patch
      }
      st.livePatchItems(patches)
      showRangeHint(p, { start: anchor.start + delta, end: anchor.end + delta }, anchor)
    }
  }

  function showRangeHint(p: { x: number; y: number }, r: DayRange, orig: DayRange) {
    const d = r.start - orig.start
    setHint({
      x: p.x,
      y: p.y,
      lines: [
        `${fmtDate(fromDay(r.start))} → ${fmtDate(fromDay(r.end - 1))}`,
        `${lengthDays(r)} dias · ${calendarMonthsTouched(r)} meses-calendário${d ? ` · ${d > 0 ? "+" : ""}${d} d` : ""}`,
      ],
    })
  }

  function onPointerUp(e: React.PointerEvent<SVGSVGElement>) {
    const g = gesture.current
    gesture.current = null
    setHint(null)
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
      const hits = visible.filter((it) => {
        const ry = rows.yOf(it)
        if (ry == null) return false
        const top = Y(ry) + 6, bot = top + ROW_H - 12
        return it.range.end > d1 && it.range.start < d2 && bot > y1 && top < y2
      })
      st.select(hits.map((h) => h.id), g.additive)
      return
    }
    if (g.type === "move") {
      if (!g.began && g.clickSelect) st.select([g.clickSelect])
      if (g.began) {
        const it = visible.find((i) => i.id === g.anchor)
        st.end(it ? `${it.name}` : undefined)
      }
      return
    }
    if (g.began) {
      if (g.type === "resize-l" || g.type === "resize-r") {
        const it = visible.find((i) => i.id === g.id)
        st.end(it ? `${fmtDate(it.start)} → ${fmtDate(it.end)}` : undefined)
      } else st.end()
    }
  }

  // ── Ticks ────────────────────────────────────────────────────────────────
  const tier = LOWER_TIER(ppd)
  const years: number[] = []
  for (let y = ymd(visStart).y; y <= ymd(visEnd).y + 1; y++) years.push(y)
  const lower: { day: number; label: string; strong?: boolean }[] = []
  {
    const a = ymd(visStart)
    if (tier === "quarter") {
      for (let y = a.y; y <= ymd(visEnd).y; y++) for (let q = 0; q < 4; q++) lower.push({ day: dayOf(y, q * 3 + 1), label: `T${q + 1}`, strong: q === 0 })
    } else if (tier === "month") {
      for (let d = dayOf(a.y, a.m); d <= visEnd; d = addMonths(d, 1)) {
        const m = ymd(d).m
        lower.push({ day: d, label: ppd > 2.2 ? monthShort(m) : monthShort(m)[0].toUpperCase(), strong: m === 1 })
      }
    } else if (tier === "week") {
      for (let d = dayOf(a.y, a.m); d <= visEnd; d = addMonths(d, 1)) lower.push({ day: d, label: `${monthShort(ymd(d).m)}`, strong: true })
      const w0 = visStart - ((ymd(visStart).dow + 6) % 7)
      for (let d = w0; d <= visEnd; d += 7) lower.push({ day: d, label: String(ymd(d).d) })
    } else {
      for (let d = visStart; d <= visEnd; d++) {
        const t = ymd(d)
        lower.push({ day: d, label: String(t.d), strong: t.d === 1 })
      }
    }
  }

  const sel = new Set(selection)
  const compareMap = useMemo(() => new Map((compare ?? []).map((c) => [c.id, c])), [compare])
  const byId = useMemo(() => new Map(visible.map((i) => [i.id, i])), [visible])
  const scenario = doc.scenarios.find((s) => s.id === useStudio.getState().scenarioId)

  const g = gesture.current
  const marquee = g && g.type === "marquee" ? g : null
  const cursor = spaceDown || view.tool === "hand" ? "grab" : view.tool === "note" ? "copy" : view.tool === "connect" ? "crosshair" : "default"

  const postVigFrom = vigencias.length ? Math.min(...vigencias.map((v) => v.range.end)) : null
  const maxOverEnd = overruns.length ? Math.max(...overruns.map((o) => o.after.end)) : null

  return (
    <div ref={wrapRef} className="relative h-full w-full overflow-hidden bg-canvas select-none">
      <svg
        ref={svgRef}
        id="timeline-svg"
        xmlns="http://www.w3.org/2000/svg"
        width={size.w}
        height={size.h}
        style={{ cursor, display: "block", touchAction: "none", fontFamily: "Inter Tight, system-ui, sans-serif" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          useStudio.getState().cancel()
          gesture.current = null
          setHint(null)
        }}
        onDoubleClick={(e) => {
          const hit = (e.target as Element).closest<SVGElement>("[data-hit]")
          if (hit?.dataset.hit?.startsWith("item")) useStudio.getState().setEditing(hit.dataset.id ?? null)
          if (hit?.dataset.hit === "ann") useStudio.setState({ selectedAnnotation: hit.dataset.id ?? null })
        }}
      >
        <defs>
          <pattern id="hatch-after" patternUnits="userSpaceOnUse" width="7" height="7" patternTransform="rotate(45)">
            <rect width="7" height="7" fill={BRAND.orange} fillOpacity="0.18" />
            <line x1="0" y1="0" x2="0" y2="7" stroke={BRAND.orange} strokeWidth="2.4" strokeOpacity="0.85" />
          </pattern>
          <pattern id="hatch-undetermined" patternUnits="userSpaceOnUse" width="10" height="10" patternTransform="rotate(-45)">
            <line x1="0" y1="0" x2="0" y2="10" stroke="#ffffff" strokeWidth="1" strokeOpacity="0.18" />
          </pattern>
          <linearGradient id="fade-undetermined" x1="0" x2="1">
            <stop offset="0" stopColor="#fff" stopOpacity="0" />
            <stop offset="0.12" stopColor="#fff" stopOpacity="1" />
            <stop offset="0.88" stopColor="#fff" stopOpacity="1" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <mask id="mask-undetermined" maskContentUnits="objectBoundingBox">
            <rect width="1" height="1" fill="url(#fade-undetermined)" />
          </mask>
          <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="#9FB6E8" />
          </marker>
          <clipPath id="clip-body">
            <rect x={LABEL_W} y={RULER_H} width={Math.max(0, size.w - LABEL_W)} height={Math.max(0, bodyH)} />
          </clipPath>
          <clipPath id="clip-labels">
            <rect x={0} y={RULER_H} width={LABEL_W} height={Math.max(0, bodyH)} />
          </clipPath>
        </defs>

        <rect x={0} y={0} width={size.w} height={size.h} fill="#060D20" />

        {/* ── Body ─────────────────────────────────────────────────────── */}
        <g clipPath="url(#clip-body)">
          {/* Layer bands */}
          {rows.blocks.map((b, i) => (
            <rect key={b.id} x={LABEL_W} y={Y(b.top)} width={size.w} height={b.height} fill={i % 2 ? "#071027" : "#08132D"} />
          ))}
          {/* Vigência background band */}
          {vigencias.map((v) => (
            <rect key={`vb-${v.id}`} x={X(v.range.start)} y={RULER_H} width={Math.max(0, (v.range.end - v.range.start) * ppd)} height={bodyH} fill={BRAND.orange} fillOpacity={0.045} />
          ))}
          {/* After the vigência: a distinct but quiet region, up to the last activity that continues */}
          {postVigFrom != null && maxOverEnd != null && maxOverEnd > postVigFrom && (
            <rect x={X(postVigFrom)} y={RULER_H} width={(maxOverEnd - postVigFrom) * ppd} height={bodyH} fill="url(#hatch-undetermined)" opacity={0.6} />
          )}
          {/* Grid */}
          {lower.map((t, i) => (
            <line key={`g${i}`} x1={X(t.day)} x2={X(t.day)} y1={RULER_H} y2={size.h} stroke={t.strong ? BRAND.gridStrong : BRAND.grid} strokeWidth={1} />
          ))}
          {years.map((y) => (
            <line key={`gy${y}`} x1={X(dayOf(y, 1))} x2={X(dayOf(y, 1))} y1={RULER_H} y2={size.h} stroke="#2A3F78" strokeWidth={1.2} />
          ))}
          {/* Layer headers in the body */}
          {rows.blocks.map((b) => (
            <line key={`h-${b.id}`} x1={LABEL_W} x2={size.w} y1={Y(b.top) + 0.5} y2={Y(b.top) + 0.5} stroke="#1A2A52" />
          ))}

          {/* Compare scenario ghosts */}
          {compare &&
            visible.map((it) => {
              const c = compareMap.get(it.id)
              const ry = rows.yOf(it)
              if (!c || ry == null || (c.range.start === it.range.start && c.range.end === it.range.end)) return null
              return (
                <rect key={`cmp-${it.id}`} x={X(c.range.start)} y={Y(ry) + 4} width={Math.max(2, (c.range.end - c.range.start) * ppd)} height={ROW_H - 8} rx={6}
                  fill="none" stroke={BRAND.scenario} strokeWidth={1.5} strokeDasharray="3 3" opacity={0.9} pointerEvents="none" />
              )
            })}

          {/* Links */}
          {view.showLinks &&
            doc.links.map((l) => {
              const a = byId.get(l.from)
              const b = byId.get(l.to)
              const ya = a && rows.yOf(a)
              const yb = b && rows.yOf(b)
              if (!a || !b || ya == null || yb == null) return null
              const ax = X(Math.min(a.range.end, Math.max(a.range.start, b.range.start)))
              const ay = Y(ya) + ROW_H / 2
              const bx = X(b.range.start) + 2
              const by = Y(yb) + ROW_H / 2
              const dx = Math.max(30, Math.abs(bx - ax) / 2)
              const sameStart = Math.abs(bx - ax) < 8
              const d = sameStart
                ? `M${ax + 10},${ay + 12} C${ax - 30},${ay + 12} ${bx - 30},${by - 12} ${bx + 8},${by - 12}`
                : `M${ax},${ay} C${ax + dx},${ay} ${bx - dx},${by} ${bx},${by}`
              return (
                <g key={l.id} opacity={0.75}>
                  <path d={d} fill="none" stroke="#9FB6E8" strokeWidth={1.4} strokeDasharray="4 3" markerEnd="url(#arrow)" />
                  {l.label && (
                    <text x={(ax + bx) / 2} y={(ay + by) / 2 - 6} fontSize={10} fill="#9FB6E8" textAnchor="middle">{l.label}</text>
                  )}
                </g>
              )
            })}

          {/* Items */}
          {visible.map((it) => {
            const ry = rows.yOf(it)
            if (ry == null) return null
            const block = rows.blocks.find((b) => b.id === it.layer)
            const collapsed = block?.collapsed
            const color = itemColor(it.kind, colorOf(it.projectId), it.color)
            const st = barStyle(it.certainty)
            const top = Y(ry) + (collapsed ? 2 : 5)
            const h = collapsed ? COLLAPSED_H - 4 : ROW_H - 10
            const x1 = X(it.range.start)
            const x2 = X(it.range.end)
            if (x2 < LABEL_W - 40 || x1 > size.w + 40) return null
            const w = Math.max(2, x2 - x1)
            const isSel = sel.has(it.id)
            const over = overruns.find((o) => o.item.id === it.id)
            const dim = dimmed(it)
            const isMarco = it.kind === "marco"

            if (isMarco) {
              const cx = x1
              const cy = top + h / 2
              return (
                <g key={it.id} opacity={dim ? 0.25 : 1}>
                  <line x1={cx} x2={cx} y1={top - 2} y2={top + h + 2} stroke={color} strokeWidth={1} strokeDasharray="2 2" />
                  <path data-hit="item" data-id={it.id} d={`M${cx},${cy - 9} L${cx + 9},${cy} L${cx},${cy + 9} L${cx - 9},${cy} Z`}
                    fill={st.fillOpacity > 0.5 ? color : "#0B1736"} stroke={color} strokeWidth={2} strokeDasharray={st.dash} style={{ cursor: it.locked ? "not-allowed" : "grab" }} />
                  {isSel && <circle cx={cx} cy={cy} r={13} fill="none" stroke="#fff" strokeWidth={1.5} />}
                  {!collapsed && (
                    <text x={cx + 14} y={cy + 4} fontSize={12} fill="#DCE6FF" pointerEvents="none">
                      {fmtDate(it.start)} · {truncate(it.name, 260)}
                    </text>
                  )}
                </g>
              )
            }

            const labelInside = w > 90
            const textX = labelInside ? Math.max(x1, LABEL_W) + 10 : x2 + 8
            const labelRoom = labelInside ? Math.min(x2, size.w) - Math.max(x1, LABEL_W) - (over ? 0 : 20) : 280

            return (
              <g key={it.id} opacity={dim ? 0.22 : 1} style={{ color }} onPointerEnter={() => setHover(it.id)} onPointerLeave={() => setHover((h0) => (h0 === it.id ? null : h0))}>
                {/* Baseline ghost when the scenario moved this record */}
                {it.baseRange && !collapsed && (
                  <rect x={X(it.baseRange.start)} y={top - 1} width={Math.max(2, (it.baseRange.end - it.baseRange.start) * ppd)} height={h + 2} rx={7}
                    fill="none" stroke="#ffffff" strokeOpacity={0.35} strokeDasharray="2 3" pointerEvents="none" />
                )}
                <rect
                  data-hit="item"
                  data-id={it.id}
                  x={x1}
                  y={top}
                  width={w}
                  height={h}
                  rx={collapsed ? 3 : 7}
                  fill={color}
                  fillOpacity={st.fillOpacity}
                  stroke={st.strokeOpacity ? color : "none"}
                  strokeOpacity={st.strokeOpacity}
                  strokeWidth={1.6}
                  strokeDasharray={st.dash}
                  mask={it.dateUndetermined ? "url(#mask-undetermined)" : undefined}
                  style={{ cursor: it.locked ? "not-allowed" : "grab" }}
                />
                {it.dateUndetermined && !collapsed && (
                  <rect x={x1} y={top} width={w} height={h} rx={7} fill="url(#hatch-undetermined)" pointerEvents="none" />
                )}
                {/* Continuity after vigência: the bar continues; the overflow is hatched, never cut. */}
                {over && (
                  <rect x={X(over.after.start)} y={top} width={Math.max(2, (over.after.end - over.after.start) * ppd)} height={h} rx={collapsed ? 3 : 7}
                    fill="url(#hatch-after)" stroke={BRAND.orange} strokeWidth={1.2} pointerEvents="none" />
                )}
                {!collapsed && (
                  <>
                    <text x={textX} y={top + h / 2 + 4} fontSize={12} fontWeight={600} fill={st.fillOpacity > 0.5 && labelInside ? "#ffffff" : "#DCE6FF"} pointerEvents="none">
                      {truncate(it.name, labelRoom)}
                      {it.dateUndetermined && labelRoom > 330 ? "  · datas não comprovadas" : ""}
                    </text>
                    {st.pending && w > 24 && (
                      <g pointerEvents="none" transform={`translate(${Math.min(x2, size.w) - 14},${top + 4})`}>
                        <circle cx={5} cy={5} r={6} fill="#0A1633" stroke="#FFD08A" strokeWidth={1} />
                        <text x={5} y={8.5} fontSize={9} fontWeight={800} textAnchor="middle" fill="#FFD08A">!</text>
                      </g>
                    )}
                    {it.changed && (
                      <g pointerEvents="none" transform={`translate(${x1 - 2},${top - 7})`}>
                        <rect width={18} height={13} rx={3} fill={BRAND.scenario} />
                        <text x={9} y={10} fontSize={9.5} fontWeight={800} textAnchor="middle" fill="#1B1240">Δ</text>
                      </g>
                    )}
                    {over && (
                      <g pointerEvents="none" transform={`translate(${X(over.after.end) + 6},${top + h / 2 + 4})`}>
                        <text fontSize={11} fontWeight={700} fill={BRAND.orange}>+{over.months} m após vigência</text>
                      </g>
                    )}
                    {it.locked && (
                      <text x={x1 + 4} y={top - 2} fontSize={9} fill="#93A3C8" pointerEvents="none">bloqueado</text>
                    )}
                  </>
                )}
                {isSel && (
                  <>
                    <rect x={x1 - 2} y={top - 2} width={w + 4} height={h + 4} rx={8} fill="none" stroke="#ffffff" strokeWidth={1.6} pointerEvents="none" />
                    {!it.locked && !collapsed && (
                      <>
                        <rect data-hit="item-l" data-id={it.id} x={x1 - 5} y={top + 3} width={8} height={h - 6} rx={3} fill="#ffffff" style={{ cursor: "ew-resize" }} />
                        <rect data-hit="item-r" data-id={it.id} x={x2 - 3} y={top + 3} width={8} height={h - 6} rx={3} fill="#ffffff" style={{ cursor: "ew-resize" }} />
                      </>
                    )}
                  </>
                )}
                {/* Invisible edge grips so an unselected bar can be resized directly too */}
                {!isSel && !it.locked && !collapsed && w > 16 && (
                  <>
                    <rect data-hit="item-l" data-id={it.id} x={x1 - 3} y={top} width={7} height={h} fill="transparent" style={{ cursor: "ew-resize" }} />
                    <rect data-hit="item-r" data-id={it.id} x={x2 - 4} y={top} width={7} height={h} fill="transparent" style={{ cursor: "ew-resize" }} />
                  </>
                )}
                {hover === it.id && !isSel && !collapsed && (
                  <rect x={x1 - 1} y={top - 1} width={w + 2} height={h + 2} rx={8} fill="none" stroke="#ffffff" strokeOpacity={0.45} pointerEvents="none" />
                )}
              </g>
            )
          })}

          {/* Vigência end markers */}
          {vigencias.map((v) => (
            <g key={`ve-${v.id}`} pointerEvents="none">
              <line x1={X(v.range.end)} x2={X(v.range.end)} y1={RULER_H} y2={size.h} stroke={BRAND.orange} strokeWidth={2} />
            </g>
          ))}
          {/* Reference date */}
          <line x1={X(refDay)} x2={X(refDay)} y1={RULER_H} y2={size.h} stroke={BRAND.ref} strokeWidth={1.4} strokeDasharray="5 4" pointerEvents="none" />

          {/* Annotations */}
          {view.showAnnotations &&
            doc.annotations.map((a) => {
              const linked = a.linkedItemId ? byId.get(a.linkedItemId) : undefined
              let day: number
              let rowY: number
              let anchor: { x: number; y: number } | null = null
              if (linked) {
                const ry = rows.yOf(linked)
                if (ry == null) return null
                day = linked.range.start + (a.offsetDays ?? 0)
                rowY = ry + a.y
                anchor = { x: X(Math.min(linked.range.end, Math.max(linked.range.start, day))), y: Y(ry) + ROW_H / 2 }
              } else if (a.linkedItemId) {
                return null
              } else {
                day = toDay(a.date)
                rowY = a.y
              }
              const x = X(day)
              const y = Y(rowY)
              const isSelA = selectedAnnotation === a.id
              if (a.kind === "marker") {
                return (
                  <g key={a.id}>
                    <line x1={x} x2={x} y1={RULER_H} y2={size.h} stroke="#FFD08A" strokeDasharray="1 3" />
                    <g data-hit="ann" data-id={a.id} style={{ cursor: "move" }} transform={`translate(${x},${y})`}>
                      <path d="M0,0 L0,22 M0,0 L14,5 L0,10" stroke="#FFD08A" strokeWidth={2} fill="#FFD08A" />
                      <text x={18} y={10} fontSize={12} fontWeight={600} fill="#FFE2B3">{a.text}</text>
                      {isSelA && <rect x={-4} y={-4} width={30 + a.text.length * 6.6} height={30} fill="none" stroke="#fff" strokeDasharray="3 2" />}
                    </g>
                  </g>
                )
              }
              if (a.kind === "highlight") {
                const wpx = Math.max(20, (a.width ?? 90) * ppd)
                return (
                  <g key={a.id} data-hit="ann" data-id={a.id} style={{ cursor: "move" }}>
                    <rect x={x} y={RULER_H} width={wpx} height={bodyH} fill="#FFD08A" fillOpacity={0.08} stroke={isSelA ? "#fff" : "#FFD08A"} strokeOpacity={0.5} strokeDasharray="4 3" />
                    <text x={x + 6} y={y + 14} fontSize={12} fontWeight={600} fill="#FFE2B3">{a.text}</text>
                  </g>
                )
              }
              const width = a.width ?? 200
              const lines = wrapText(a.text, width - 20)
              const hh = lines.length * 16 + 14
              const palette = a.kind === "note" ? { bg: "#FFF3C4", fg: "#3A2A00", bd: "#E9C46A" } : a.kind === "comment" ? { bg: "#DDE7FF", fg: "#0A1633", bd: "#9FB6E8" } : { bg: "#0E1D45", fg: "#E8EEFC", bd: a.color ?? BRAND.orange }
              return (
                <g key={a.id}>
                  {anchor && (
                    <path d={`M${x + 12},${y + hh} L${anchor.x},${anchor.y}`} stroke={palette.bd} strokeWidth={1.3} fill="none" markerEnd="url(#arrow)" pointerEvents="none" />
                  )}
                  <g data-hit="ann" data-id={a.id} transform={`translate(${x},${y})`} style={{ cursor: "move" }}>
                    <rect width={width} height={hh} rx={a.kind === "comment" ? 12 : 6} fill={palette.bg} stroke={isSelA ? "#ffffff" : palette.bd} strokeWidth={isSelA ? 2 : 1.2} />
                    {a.kind === "callout" && <rect width={4} height={hh} rx={2} fill={palette.bd} />}
                    {lines.map((ln, i) => (
                      <text key={i} x={12} y={20 + i * 16} fontSize={12} fontWeight={a.kind === "callout" ? 600 : 500} fill={palette.fg}>{ln}</text>
                    ))}
                  </g>
                </g>
              )
            })}
        </g>

        {/* ── Label column ─────────────────────────────────────────────── */}
        <rect x={0} y={RULER_H} width={LABEL_W} height={bodyH} fill="#08112A" />
        <g clipPath="url(#clip-labels)">
          {rows.blocks.map((b) => (
            <g key={`lbl-${b.id}`}>
              <text x={14} y={Y(b.top) + 17} fontSize={11} fontWeight={700} letterSpacing={1.2} fill="#BFD0F5">{b.label.toUpperCase()}</text>
              {!b.collapsed && (
                <text x={14} y={Y(b.top) + HEADER_H + 14} fontSize={10.5} fill="#6F82B0">
                  {b.lanes} {b.lanes === 1 ? "faixa" : "faixas"}
                </text>
              )}
              <line x1={0} x2={LABEL_W} y1={Y(b.top) + 0.5} y2={Y(b.top) + 0.5} stroke="#1A2A52" />
            </g>
          ))}
        </g>
        <line x1={LABEL_W} x2={LABEL_W} y1={0} y2={size.h} stroke="#1F2F57" />

        {/* ── Ruler ────────────────────────────────────────────────────── */}
        <rect x={0} y={0} width={size.w} height={RULER_H} fill="#0A1430" />
        <g>
          <svg x={LABEL_W} y={0} width={Math.max(0, size.w - LABEL_W)} height={RULER_H} overflow="hidden">
            {years.map((y) => {
              const xs = X(dayOf(y, 1)) - LABEL_W
              return (
                <g key={`ry${y}`}>
                  <line x1={xs} x2={xs} y1={0} y2={RULER_H} stroke="#2A3F78" />
                  <text x={Math.min(Math.max(xs + 8, 8), X(dayOf(y + 1, 1)) - LABEL_W - 44)} y={19} fontSize={13} fontWeight={700} fill="#E8EEFC">{y}</text>
                </g>
              )
            })}
            {lower.map((t, i) => {
              const xs = X(t.day) - LABEL_W
              return (
                <g key={`rl${i}`}>
                  <line x1={xs} x2={xs} y1={t.strong ? 28 : 34} y2={RULER_H} stroke={t.strong ? "#2A3F78" : "#1C2C57"} />
                  {(tier !== "day" || ppd > 22) && <text x={xs + 4} y={45} fontSize={10.5} fill="#8FA2CF">{t.label}</text>}
                </g>
              )
            })}
            {/* Marker flags in the ruler */}
            {vigencias.map((v) => (
              <g key={`rf-${v.id}`} transform={`translate(${X(v.range.end) - LABEL_W},0)`}>
                <rect x={-1} y={0} width={2} height={RULER_H} fill={BRAND.orange} />
                <rect x={4} y={24} width={142} height={16} rx={4} fill={BRAND.orange} />
                <text x={10} y={36} fontSize={10} fontWeight={700} fill="#1A0B00">Fim vigência {fmtDate(fromDay(v.range.end - 1))}</text>
              </g>
            ))}
            <g transform={`translate(${X(refDay) - LABEL_W},0)`}>
              <rect x={-1} y={22} width={2} height={RULER_H - 22} fill={BRAND.ref} />
              <rect x={-118} y={24} width={114} height={16} rx={4} fill="#0E2A4D" stroke={BRAND.ref} strokeWidth={1} />
              <text x={-112} y={36} fontSize={10} fontWeight={700} fill={BRAND.ref}>Referência {fmtDate(settings.referenceDate)}</text>
            </g>
          </svg>
        </g>
        <text x={14} y={20} fontSize={11} fontWeight={700} fill="#E8EEFC">{scenario?.name ?? ""}</text>
        <text x={14} y={38} fontSize={10} fill="#6F82B0">
          {tier === "quarter" ? "anos · trimestres" : tier === "month" ? "anos · meses" : tier === "week" ? "meses · semanas" : "meses · dias"}
        </text>
        <line x1={0} x2={size.w} y1={RULER_H} y2={RULER_H} stroke="#1F2F57" />

        {/* Marquee */}
        {marquee && (
          <rect x={Math.min(marquee.sx, marquee.cx)} y={Math.min(marquee.sy, marquee.cy)} width={Math.abs(marquee.cx - marquee.sx)} height={Math.abs(marquee.cy - marquee.sy)}
            fill="#2EA8FF" fillOpacity={0.1} stroke="#2EA8FF" strokeDasharray="4 3" pointerEvents="none" />
        )}

        {/* Drag hint */}
        {hint && hint.lines.length > 0 && (
          <g transform={`translate(${Math.min(hint.x + 16, size.w - 290)},${Math.max(RULER_H + 8, hint.y - 54)})`} pointerEvents="none">
            <rect width={280} height={44} rx={8} fill="#0B1736" stroke="#2EA8FF" />
            <text x={12} y={19} fontSize={12.5} fontWeight={700} fill="#E8EEFC">{hint.lines[0]}</text>
            <text x={12} y={35} fontSize={11} fill="#93A3C8">{hint.lines[1]}</text>
          </g>
        )}
      </svg>

      {/* Vertical scrollbar */}
      {maxScroll > 0 && (
        <div className="absolute top-[52px] right-1 bottom-1 w-1.5 rounded-full bg-white/5">
          <div
            className="absolute w-1.5 rounded-full bg-white/25"
            style={{ top: `${(scrollY / (rows.total + 40)) * 100}%`, height: `${Math.min(100, (bodyH / (rows.total + 40)) * 100)}%` }}
          />
        </div>
      )}
      {view.connectFrom && (
        <div className="pointer-events-none absolute top-16 left-1/2 -translate-x-1/2 rounded-full border border-primary/60 bg-panel px-3 py-1 text-xs">
          Conectando a partir de “{byId.get(view.connectFrom)?.name}” — clique no destino (Esc cancela)
        </div>
      )}
    </div>
  )
}

export function exportSvgString(): string | null {
  const svg = document.getElementById("timeline-svg") as SVGSVGElement | null
  if (!svg) return null
  const clone = svg.cloneNode(true) as SVGSVGElement
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg")
  clone.removeAttribute("style")
  clone.setAttribute("font-family", "Inter Tight, Arial, sans-serif")
  return new XMLSerializer().serializeToString(clone)
}
