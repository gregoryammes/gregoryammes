import { createSeed } from "./seed"
import { applyV6 } from "./v6"
import type { Item, StudioDoc } from "./types"
import { DEFAULT_LAYER } from "./types"

/**
 * Brings a document saved by an earlier version to the grouped layout. Only row order, group
 * placement and the clean/detailed flag change — dates, statuses and values are never touched.
 */
export function normalizeDoc(d: StudioDoc): StudioDoc {
  const grouped = normalizeGroups(d)
  return (grouped.settings.modelVersion ?? 0) >= 6 ? grouped : applyV6(grouped)
}

/** True when loading this document will change it (callers back it up first). */
export const needsMigration = (d: StudioDoc) => d.settings.layout !== "groups-v2" || (d.settings.modelVersion ?? 0) < 6

function normalizeGroups(d: StudioDoc): StudioDoc {
  if (d.settings.layout === "groups-v2") return d
  const seed = new Map(createSeed().items.map((i) => [i.id, i]))
  const fix = (it: Item): Item => {
    const s = seed.get(it.id)
    if (s) return { ...it, layer: s.layer, lane: s.lane, detail: s.detail }
    const layer = it.layer === "cenarios" ? DEFAULT_LAYER[it.kind] : it.layer
    return { ...it, layer, lane: 100 + it.lane }
  }
  const LEGACY: Record<string, string> = { "#5B7FE0": "#23845D", "#2EA8FF": "#087CB8", "#A78BFA": "#173B63" }
  return {
    ...d,
    projects: d.projects.map((p) => ({ ...p, color: LEGACY[p.color] ?? p.color })),
    items: d.items.map(fix),
    scenarios: d.scenarios.map((s) => ({ ...s, added: s.added.map(fix) })),
    settings: {
      ...d.settings,
      layout: "groups-v2",
      groupsHidden: d.settings.groupsHidden ?? [],
      groupsCollapsed: d.settings.groupsCollapsed ?? [],
      groupsDetailed: d.settings.groupsDetailed ?? [],
      journeyCohorts: d.settings.journeyCohorts ?? { from: 2022, to: 2026 },
    },
  }
}
