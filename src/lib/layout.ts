import { GROUPS, groupOf, isDetail, type Consolidation, type GroupId } from "@/data/types"
import type { EffItem } from "./analysis"

export const LABEL_W = 264
export const GROUP_H = 34
export const ROW_H = 40
export const BAR_H = 28
export const MORE_H = 28
export const PORTFOLIO_H = 64
/** Sub-lane height inside a consolidated row when segments overlap. */
export const SUB_H = 15

type ItemRow = { type: "item"; group: GroupId; top: number; h: number; item: EffItem; index: number; virtual?: "hyp"; portfolio?: boolean }

export type Row =
  | { type: "group"; group: GroupId; top: number; h: number; count: number; hiddenDetail: number; collapsed: boolean; detailed: boolean; label?: string }
  | ItemRow
  | { type: "consolidated"; group: GroupId; top: number; h: number; key: string; name: string; subtitle?: string; members: EffItem[]; lanes: number[]; laneCount: number; index: number }
  | { type: "more"; group: GroupId; top: number; h: number; count: number }

export interface RowLayout {
  rows: Row[]
  total: number
  /** First row of an item (its documental row when a hypothesis row also exists). */
  rowOf: (id: string) => ItemRow | undefined
  /** Rows a dragged record can be dropped among. */
  orderOf: (g: GroupId) => string[]
  /** Insertion target for a vertical drop at body-y. */
  dropAt: (y: number) => { group: GroupId; index: number; lineY: number } | null
}

export const sortRows = (a: EffItem, b: EffItem) => a.lane - b.lane || a.range.start - b.range.start || a.name.localeCompare(b.name)

/** Greedy interval packing: overlapping segments of a consolidated row get separate sub-lanes. */
export function packLanes(members: EffItem[]) {
  const ends: number[] = []
  const lanes = members.map((m) => {
    let lane = ends.findIndex((e) => e <= m.range.start)
    if (lane < 0) lane = ends.length
    ends[lane] = m.range.end
    return lane
  })
  return { lanes, count: Math.max(1, ends.length) }
}

export interface RowOptions {
  hidden: GroupId[]
  collapsed: GroupId[]
  detailed: GroupId[]
  detailAll: boolean
  /** "projects" draws only the three cycles; "all" the full matrix. */
  portfolio?: boolean
  consolidations?: Consolidation[]
}

export function computeRows(items: EffItem[], opts: RowOptions): RowLayout {
  const rows: Row[] = []
  let y = 0
  const order = new Map<GroupId, string[]>()

  if (opts.portfolio) {
    const projects = items.filter((i) => i.kind === "projeto").sort((a, b) => a.range.start - b.range.start)
    rows.push({ type: "group", group: "g1", top: y, h: GROUP_H, count: projects.length, hiddenDetail: 0, collapsed: false, detailed: true, label: "Portfólio · Projetos 1, 2 e 3" })
    y += GROUP_H
    projects.forEach((it, index) => {
      rows.push({ type: "item", group: "g1", top: y, h: PORTFOLIO_H, item: it, index, portfolio: true })
      y += PORTFOLIO_H
    })
    return finish(rows, y + 8, order)
  }

  const cons = new Map((opts.consolidations ?? []).map((c) => [c.id, c]))
  for (const g of GROUPS) {
    if (opts.hidden.includes(g.id)) continue
    const all = items.filter((i) => groupOf(i) === g.id).sort(sortRows)
    const detailed = opts.detailAll || opts.detailed.includes(g.id)
    const shown = detailed ? all : all.filter((i) => !isDetail(i))
    const collapsed = opts.collapsed.includes(g.id)
    rows.push({ type: "group", group: g.id, top: y, h: GROUP_H, count: all.length, hiddenDetail: all.length - shown.length, collapsed, detailed })
    y += GROUP_H
    order.set(g.id, shown.filter((i) => !i.consolidation || !cons.has(i.consolidation)).map((i) => i.id))
    if (collapsed) continue
    const placed = new Set<string>()
    let index = 0
    for (const it of shown) {
      const key = it.consolidation
      if (key && cons.has(key)) {
        // One visual row for the whole programme; the records stay separate underneath.
        if (placed.has(key)) continue
        placed.add(key)
        const members = shown.filter((m) => m.consolidation === key).sort((a, b) => a.range.start - b.range.start)
        const { lanes, count } = packLanes(members)
        const h = Math.max(ROW_H, 12 + count * (SUB_H + 3))
        const c = cons.get(key)!
        rows.push({ type: "consolidated", group: g.id, top: y, h, key, name: c.name, subtitle: c.subtitle, members, lanes, laneCount: count, index })
        y += h
        index++
        continue
      }
      rows.push({ type: "item", group: g.id, top: y, h: ROW_H, item: it, index })
      y += ROW_H
      // A simulated vigência gets its own row under the documental one: one date never replaces the other.
      if (it.kind === "vigencia" && it.baseRange) {
        rows.push({ type: "item", group: g.id, top: y, h: ROW_H, item: it, index, virtual: "hyp" })
        y += ROW_H
      }
      index++
    }
    if (all.length > shown.length || (detailed && !opts.detailAll && all.some((i) => isDetail(i)))) {
      rows.push({ type: "more", group: g.id, top: y, h: MORE_H, count: all.length - shown.length })
      y += MORE_H
    }
    y += 8
  }
  return finish(rows, y, order)
}

function finish(rows: Row[], total: number, order: Map<GroupId, string[]>): RowLayout {
  const itemRows = rows.filter((r): r is ItemRow => r.type === "item" && !r.virtual && !r.portfolio)
  return {
    rows,
    total,
    rowOf: (id) => rows.find((r): r is ItemRow => r.type === "item" && r.item.id === id && !r.virtual),
    orderOf: (g) => order.get(g) ?? [],
    dropAt: (yy) => {
      if (!itemRows.length) return null
      let best = itemRows[0]
      for (const r of itemRows) if (yy >= r.top) best = r
      const ord = order.get(best.group) ?? []
      const idx = Math.max(0, ord.indexOf(best.item.id))
      const after = yy > best.top + best.h / 2
      return { group: best.group, index: idx + (after ? 1 : 0), lineY: after ? best.top + best.h : best.top }
    },
  }
}
