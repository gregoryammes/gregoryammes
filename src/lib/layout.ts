import { GROUPS, groupOf, isDetail, type GroupId } from "@/data/types"
import type { EffItem } from "./analysis"

export const LABEL_W = 264
export const GROUP_H = 34
export const ROW_H = 40
export const BAR_H = 28
export const MORE_H = 28

export type Row =
  | { type: "group"; group: GroupId; top: number; h: number; count: number; hiddenDetail: number; collapsed: boolean; detailed: boolean }
  | { type: "item"; group: GroupId; top: number; h: number; item: EffItem; index: number; virtual?: "hyp" }
  | { type: "more"; group: GroupId; top: number; h: number; count: number }

export interface RowLayout {
  rows: Row[]
  total: number
  /** First row of an item (its documental row when a hypothesis row also exists). */
  rowOf: (id: string) => Extract<Row, { type: "item" }> | undefined
  /** Rows a dragged record can be dropped among. */
  orderOf: (g: GroupId) => string[]
  /** Insertion target for a vertical drop at body-y. */
  dropAt: (y: number) => { group: GroupId; index: number; lineY: number } | null
}

export const sortRows = (a: EffItem, b: EffItem) => a.lane - b.lane || a.range.start - b.range.start || a.name.localeCompare(b.name)

export function computeRows(
  items: EffItem[],
  opts: { hidden: GroupId[]; collapsed: GroupId[]; detailed: GroupId[]; detailAll: boolean },
): RowLayout {
  const rows: Row[] = []
  let y = 0
  const order = new Map<GroupId, string[]>()
  for (const g of GROUPS) {
    if (opts.hidden.includes(g.id)) continue
    const all = items.filter((i) => groupOf(i) === g.id).sort(sortRows)
    const detailed = opts.detailAll || opts.detailed.includes(g.id)
    const shown = detailed ? all : all.filter((i) => !isDetail(i))
    const collapsed = opts.collapsed.includes(g.id)
    rows.push({ type: "group", group: g.id, top: y, h: GROUP_H, count: all.length, hiddenDetail: all.length - shown.length, collapsed, detailed })
    y += GROUP_H
    order.set(g.id, shown.map((i) => i.id))
    if (collapsed) continue
    shown.forEach((it, index) => {
      rows.push({ type: "item", group: g.id, top: y, h: ROW_H, item: it, index })
      y += ROW_H
      // A simulated vigência gets its own row under the documental one: one date never replaces the other.
      if (it.kind === "vigencia" && it.baseRange) {
        rows.push({ type: "item", group: g.id, top: y, h: ROW_H, item: it, index, virtual: "hyp" })
        y += ROW_H
      }
    })
    if (all.length > shown.length || (detailed && !opts.detailAll && all.some((i) => isDetail(i)))) {
      rows.push({ type: "more", group: g.id, top: y, h: MORE_H, count: all.length - shown.length })
      y += MORE_H
    }
    y += 8
  }
  return {
    rows,
    total: y,
    rowOf: (id) => rows.find((r): r is Extract<Row, { type: "item" }> => r.type === "item" && r.item.id === id && !r.virtual),
    orderOf: (g) => order.get(g) ?? [],
    dropAt: (yy) => {
      const itemRows = rows.filter((r): r is Extract<Row, { type: "item" }> => r.type === "item" && !r.virtual)
      if (!itemRows.length) return null
      let best = itemRows[0]
      for (const r of itemRows) if (yy >= r.top) best = r
      const after = yy > best.top + best.h / 2
      return { group: best.group, index: best.index + (after ? 1 : 0), lineY: after ? best.top + best.h : best.top }
    },
  }
}
