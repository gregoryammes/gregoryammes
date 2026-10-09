import { LAYERS, type LayerId } from "@/data/types"
import type { EffItem } from "./analysis"

export const RULER_H = 52
export const LABEL_W = 156
export const HEADER_H = 26
export const ROW_H = 36
export const COLLAPSED_H = 14

export interface LayerBlock {
  id: LayerId
  label: string
  top: number
  height: number
  lanes: number
  collapsed: boolean
}

export interface RowLayout {
  blocks: LayerBlock[]
  total: number
  /** Top of the bar row for an item, or null when its layer is hidden. */
  yOf: (it: { layer: LayerId; lane: number }) => number | null
  laneAt: (layer: LayerId, y: number) => number
  blockAt: (y: number) => LayerBlock | undefined
}

export function computeRows(items: EffItem[], hidden: LayerId[], collapsed: LayerId[]): RowLayout {
  const blocks: LayerBlock[] = []
  let y = 0
  for (const L of LAYERS) {
    if (hidden.includes(L.id)) continue
    const its = items.filter((i) => i.layer === L.id)
    const lanes = Math.max(1, ...its.map((i) => i.lane + 1))
    const isCollapsed = collapsed.includes(L.id)
    const height = HEADER_H + (isCollapsed ? COLLAPSED_H : lanes * ROW_H) + 6
    blocks.push({ id: L.id, label: L.label, top: y, height, lanes, collapsed: isCollapsed })
    y += height
  }
  const byId = new Map(blocks.map((b) => [b.id, b]))
  return {
    blocks,
    total: y,
    yOf: (it) => {
      const b = byId.get(it.layer)
      if (!b) return null
      if (b.collapsed) return b.top + HEADER_H
      return b.top + HEADER_H + it.lane * ROW_H
    },
    laneAt: (layer, yy) => {
      const b = byId.get(layer)
      if (!b) return 0
      return Math.max(0, Math.floor((yy - b.top - HEADER_H) / ROW_H))
    },
    blockAt: (yy) => blocks.find((b) => yy >= b.top && yy < b.top + b.height),
  }
}
