import type { EffItem } from "./analysis"
import { rangeOf, type DayRange } from "./dates"
import type { Quadrant, QuadrantRule, StudioDoc } from "@/data/types"
import type { Row } from "./layout"

/* ──────────────────────────────────────────────────────────────────────────────
 * V18 — quadrants: visual highlights over a period and a band of rows. They live in
 * the visual layer only; an automatic quadrant reads its period from the effective
 * records of the active scenario and never writes to them.
 * ────────────────────────────────────────────────────────────────────────────── */

/** "Após a vigência" follows the formation: the courses (and turmas) that cross the vigência end. */
const CROSSING_KINDS = new Set(["curso", "turma"])

/** Period of a rule in the active scenario, or null when the rule yields nothing (e.g. nothing after the vigência). */
export function ruleRange(rule: QuadrantRule, items: EffItem[]): DayRange | null {
  const cycle = (pid: string) => items.find((i) => i.kind === "projeto" && i.projectId === pid && !i.hidden)
  if (rule.kind === "project_period") {
    const c = cycle(rule.projectId)
    return c ? { ...c.range } : null
  }
  if (rule.kind === "between_projects") {
    const a = cycle(rule.fromProjectId)
    const b = cycle(rule.toProjectId)
    if (!a || !b || b.range.start <= a.range.end) return null
    return { start: a.range.end, end: b.range.start }
  }
  const v = items.find((i) => i.kind === "vigencia" && i.projectId === rule.projectId && !i.hidden)
  if (!v) return null
  const ends = items
    .filter((i) => i.projectId === rule.projectId && CROSSING_KINDS.has(i.kind) && !i.hidden && !i.dateUndetermined && i.range.start < v.range.end && i.range.end > v.range.end)
    .map((i) => i.range.end)
  return ends.length ? { start: v.range.end, end: Math.max(...ends) } : null
}

/** Period of a quadrant: its own dates (manual) or its rule (auto). */
export function quadrantRange(q: Quadrant, items: EffItem[]): DayRange | null {
  if (q.mode === "auto" && q.rule) return ruleRange(q.rule, items)
  try {
    const r = rangeOf(q.start, q.end)
    return r.end > r.start ? r : null
  } catch {
    return null
  }
}

export const RULE_LABEL: Record<QuadrantRule["kind"], string> = {
  after_vigencia: "Após a vigência do projeto",
  project_period: "Período do projeto",
  between_projects: "Transição entre projetos",
}

export function describeRule(rule: QuadrantRule, doc: StudioDoc) {
  const name = (id: string) => doc.projects.find((p) => p.id === id)?.name ?? id
  if (rule.kind === "between_projects") return `Do fim do ${name(rule.fromProjectId)} ao início do ${name(rule.toProjectId)}`
  return `${RULE_LABEL[rule.kind]} — ${name(rule.projectId)}`
}

/** Stable key of a timeline row, used to anchor a quadrant's first and last rows. */
export function rowKey(r: Row): string {
  switch (r.type) {
    case "heading":
      return `h:${r.text}`
    case "lane":
      return `lane:${r.kind}:${r.kind === "modality" ? r.modality : r.projectId}`
    case "item":
      return `item:${r.item.id}${r.virtual ? ":hyp" : ""}`
    case "comp":
      return `comp:${r.actionId}:${r.comp}`
    case "consolidated":
      return `cons:${r.key}`
    case "project":
      return `proj:${r.projectId}`
    case "group":
      return `group:${r.group}`
    case "more":
      return `more:${r.group}`
    case "note":
      return `note:${r.index}:${r.text.slice(0, 12)}`
  }
}

export function rowTitle(r: Row, doc: StudioDoc): string {
  switch (r.type) {
    case "heading":
      return r.text.charAt(0) + r.text.slice(1).toLowerCase()
    case "lane":
      return r.kind === "project" ? r.label : r.kind === "modality" ? r.label : `${doc.projects.find((p) => p.id === r.projectId)?.short ?? ""} · ${r.label}`
    case "item":
      return `${r.item.shortName ?? r.item.name}${r.virtual ? " (cenário)" : ""}`
    case "comp":
      return `${r.prefix ? `${r.prefix} · ` : ""}${r.comp}`
    case "consolidated":
      return r.name
    case "project":
      return doc.projects.find((p) => p.id === r.projectId)?.name ?? "Sem projeto"
    default:
      return r.type
  }
}

/** Vertical extent (body coordinates) of a quadrant in the current layout. Missing anchors → whole height. */
export function quadrantRows(q: Quadrant, rows: Row[], total: number): { top: number; bottom: number; anchored: boolean } {
  const keys = rows.map(rowKey)
  const a = q.rowFrom ? keys.indexOf(q.rowFrom) : -1
  const b = q.rowTo ? keys.indexOf(q.rowTo) : -1
  if (a < 0 && b < 0) return { top: 0, bottom: total, anchored: false }
  const i = a < 0 ? 0 : a
  const j = b < 0 ? rows.length - 1 : b
  const [lo, hi] = i <= j ? [i, j] : [j, i]
  return { top: rows[lo].top, bottom: rows[hi].top + rows[hi].h, anchored: true }
}

/** Row under a body-y coordinate (for drawing a quadrant). */
export function rowAtY(rows: Row[], y: number): Row | undefined {
  let best: Row | undefined
  for (const r of rows) if (y >= r.top) best = r
  return best
}
