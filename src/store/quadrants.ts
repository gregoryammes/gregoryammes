import { isValidISO } from "@/lib/dates"
import type { Quadrant, StudioDoc } from "@/data/types"
import { uid } from "./store"

/**
 * Pure, all-or-nothing operations on quadrants. Quadrants are visual: none of these functions
 * touches items, financial records, scenarios or documents.
 */

const list = (d: StudioDoc) => d.quadrants ?? []

export function validQuadrant(q: Quadrant): string | null {
  if (!q.title.trim()) return "Informe um título."
  if (!isValidISO(q.start) || !isValidISO(q.end)) return "Data inválida."
  if (q.end < q.start) return "A data final deve ser igual ou posterior à inicial."
  if (!(q.opacity >= 0 && q.opacity <= 1)) return "Opacidade entre 0 e 100%."
  if (!/^#[0-9a-fA-F]{6}$/.test(q.color)) return "Cor inválida."
  if (q.mode === "auto" && !q.rule) return "Escolha a regra do quadrante automático."
  return null
}

export function newQuadrant(d: StudioDoc, init: Partial<Quadrant> & Pick<Quadrant, "start" | "end">): { doc: StudioDoc; id: string } {
  const id = uid("quad")
  const layer = Math.max(-1, ...list(d).map((q) => q.layer)) + 1
  const q: Quadrant = { id, title: "Novo quadrante", mode: "manual", rowFrom: null, rowTo: null, color: "#127BAF", opacity: 0.08, stroke: "solid", layer, showTitle: true, ...init }
  if (validQuadrant(q)) return { doc: d, id: "" }
  return { doc: { ...d, quadrants: [...list(d), q] }, id }
}

/** Fields that place a quadrant: a locked quadrant keeps them until it is unlocked. */
const PLACEMENT: (keyof Quadrant)[] = ["start", "end", "rowFrom", "rowTo", "mode", "rule"]

export function patchQuadrant(d: StudioDoc, id: string, patch: Partial<Quadrant>): StudioDoc {
  const cur = list(d).find((q) => q.id === id)
  if (!cur) return d
  const keys = Object.keys(patch) as (keyof Quadrant)[]
  // Nothing changes → same document (no undo entry, redo kept).
  if (keys.every((k) => JSON.stringify(cur[k]) === JSON.stringify(patch[k]))) return d
  if (cur.locked && patch.locked !== false && keys.some((k) => PLACEMENT.includes(k) && JSON.stringify(cur[k]) !== JSON.stringify(patch[k]))) return d
  const next = { ...cur, ...patch }
  if (validQuadrant(next)) return d
  return { ...d, quadrants: list(d).map((q) => (q.id === id ? next : q)) }
}

export function duplicateQuadrant(d: StudioDoc, id: string): { doc: StudioDoc; id: string } {
  const cur = list(d).find((q) => q.id === id)
  if (!cur) return { doc: d, id: "" }
  const nid = uid("quad")
  const layer = Math.max(...list(d).map((q) => q.layer)) + 1
  return { doc: { ...d, quadrants: [...list(d), { ...cur, id: nid, title: `${cur.title} (cópia)`, layer, locked: false }] }, id: nid }
}

/** Deletes only the visual highlight. */
export function deleteQuadrant(d: StudioDoc, id: string): StudioDoc {
  if (!list(d).some((q) => q.id === id)) return d
  return { ...d, quadrants: list(d).filter((q) => q.id !== id) }
}

/** Moves a quadrant one step up/down in the visual stack (still below bars and texts). */
export function shiftLayer(d: StudioDoc, id: string, dir: 1 | -1): StudioDoc {
  const sorted = [...list(d)].sort((a, b) => a.layer - b.layer)
  const i = sorted.findIndex((q) => q.id === id)
  const j = i + dir
  if (i < 0 || j < 0 || j >= sorted.length) return d
  ;[sorted[i], sorted[j]] = [sorted[j], sorted[i]]
  const layer = new Map(sorted.map((q, k) => [q.id, k]))
  return { ...d, quadrants: list(d).map((q) => ({ ...q, layer: layer.get(q.id)! })) }
}
