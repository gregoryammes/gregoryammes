import {
  calendarMonthsTouched, fmtMonthsSpan, intersect, lengthDays, partAfter, partBefore, rangeOf, toDay,
  type DayRange,
} from "./dates"
import type { Item, Scenario, StudioDoc } from "@/data/types"

export interface EffItem extends Item {
  range: DayRange
  /** True when the active scenario changes anything about this record. */
  changed: boolean
  changedFields: string[]
  /** Baseline period, when the scenario moved it. */
  baseRange?: DayRange
  /** Exists only in the scenario. */
  scenarioOnly: boolean
}

const TEMPORAL_FIELDS = new Set(["start", "end"])
/** Composition-only fields: moving a row or recolouring a bar is not a change to the record. */
const VISUAL_FIELDS = new Set(["lane", "layer", "color", "locked", "hidden", "detail", "turmaIds", "consolidation", "partner", "shortName", "courseId"])

export function getScenario(doc: StudioDoc, id: string): Scenario {
  return doc.scenarios.find((s) => s.id === id) ?? doc.scenarios[0]
}

/** Baseline items with the scenario's patches applied. Simulated period changes become `hipotese`. */
export function applyScenario(doc: StudioDoc, scenarioId: string): EffItem[] {
  const sc = getScenario(doc, scenarioId)
  const removed = new Set(sc.removed)
  const out: EffItem[] = []
  for (const it of doc.items) {
    if (removed.has(it.id)) continue
    const patch = sc.overrides[it.id]
    const merged: Item = patch ? { ...it, ...patch } : it
    const changedFields = patch ? Object.keys(patch).filter((k) => !VISUAL_FIELDS.has(k) && (patch as Record<string, unknown>)[k] !== (it as unknown as Record<string, unknown>)[k]) : []
    const temporal = changedFields.some((f) => TEMPORAL_FIELDS.has(f))
    out.push({
      ...merged,
      // A scenario can never promote a record: any simulated period is a hypothesis.
      certainty: temporal && sc.kind !== "baseline" ? "hipotese" : merged.certainty,
      range: safeRange(merged),
      changed: changedFields.length > 0,
      changedFields,
      baseRange: temporal ? safeRange(it) : undefined,
      scenarioOnly: false,
    })
  }
  for (const it of sc.added) {
    out.push({ ...it, range: safeRange(it), changed: true, changedFields: ["*"], scenarioOnly: true })
  }
  return out
}

function safeRange(it: Pick<Item, "start" | "end">): DayRange {
  try {
    const r = rangeOf(it.start, it.end)
    return r.end > r.start ? r : { start: r.start, end: r.start + 1 }
  } catch {
    return { start: 0, end: 1 }
  }
}

const CONTINUITY_KINDS = new Set(["curso", "turma", "bolsa", "atividade", "operacao", "contrato"])

export interface Overrun {
  item: EffItem
  vigencia: EffItem
  before: DayRange | null
  after: DayRange
  months: number
  days: number
}

/**
 * Temporal continuity: parts of a project's records that fall after the end of that project's
 * vigência. This is a calendar fact only — it does not say the period is uncovered or irregular.
 * Records with undetermined dates are skipped: without a dated source there is no temporal basis.
 */
export function computeOverruns(items: EffItem[]): Overrun[] {
  const vigs = items.filter((i) => i.kind === "vigencia" && !i.hidden)
  const out: Overrun[] = []
  for (const v of vigs) {
    for (const it of items) {
      if (it.projectId !== v.projectId || !CONTINUITY_KINDS.has(it.kind) || it.dateUndetermined) continue
      const after = partAfter(it.range, v.range)
      if (!after) continue
      out.push({
        item: it,
        vigencia: v,
        before: partBefore(it.range, v.range),
        after,
        months: calendarMonthsTouched(after),
        days: lengthDays(after),
      })
    }
  }
  return out
}

export function overrunFor(overruns: Overrun[], id: string) {
  return overruns.find((o) => o.item.id === id)
}

export function vigenciaOf(items: EffItem[], projectId: string | null) {
  return items.find((i) => i.kind === "vigencia" && i.projectId === projectId)
}

/** Union of day ranges (sorted, merged). */
export function unionRanges(rs: DayRange[]): DayRange[] {
  const s = [...rs].sort((a, b) => a.start - b.start)
  const out: DayRange[] = []
  for (const r of s) {
    const last = out[out.length - 1]
    if (last && r.start <= last.end) last.end = Math.max(last.end, r.end)
    else out.push({ ...r })
  }
  return out
}

export interface Indicators {
  ref: number
  projectsClosed: EffItem[]
  projectsRunning: EffItem[]
  projectsPlanned: EffItem[]
  coursesRunning: EffItem[]
  overruns: Overrun[]
  maxMonthsAfter: number
  futureGrants: EffItem[]
  pendingDecisions: number
  upcoming: { item: EffItem; day: number; what: "início" | "término" }[]
  documentedValue: number | null
  undocumentedValues: EffItem[]
  /** Calendar period after the vigência in which records exist (merged). */
  afterWindows: DayRange[]
}

export function computeIndicators(doc: StudioDoc, items: EffItem[]): Indicators {
  const ref = toDay(doc.settings.referenceDate)
  const projects = items.filter((i) => i.kind === "projeto")
  const overruns = computeOverruns(items)
  const upcoming: Indicators["upcoming"] = []
  for (const it of items) {
    if (it.dateUndetermined || it.kind === "projeto") continue
    if (it.range.start > ref && it.range.start <= ref + 365) upcoming.push({ item: it, day: it.range.start, what: "início" })
    const last = it.range.end - 1
    if (last >= ref && last <= ref + 365) upcoming.push({ item: it, day: last, what: "término" })
  }
  upcoming.sort((a, b) => a.day - b.day)
  const valued = items.filter((i) => i.finance && (i.finance.planned != null || i.finance.paid != null))
  const documented = valued.filter((i) => i.finance && (i.finance.status === "comprovado" || i.finance.status === "formalizado"))
  return {
    ref,
    projectsClosed: projects.filter((p) => p.range.end <= ref && p.certainty !== "hipotese"),
    projectsRunning: projects.filter((p) => p.range.start <= ref && p.range.end > ref && p.certainty !== "hipotese"),
    projectsPlanned: projects.filter((p) => p.certainty === "hipotese" || p.range.start > ref),
    coursesRunning: items.filter((i) => i.kind === "curso" && i.range.start <= ref && i.range.end > ref && i.certainty !== "hipotese"),
    overruns,
    maxMonthsAfter: overruns.reduce((m, o) => Math.max(m, o.months), 0),
    futureGrants: items.filter((i) => i.kind === "bolsa" && i.range.end > ref),
    pendingDecisions: doc.decisions.filter((d) => d.status !== "decidido").length,
    upcoming: upcoming.slice(0, 6),
    documentedValue: documented.length ? documented.reduce((s, i) => s + (i.finance?.paid ?? i.finance?.planned ?? 0), 0) : null,
    undocumentedValues: valued.filter((i) => !documented.includes(i)),
    afterWindows: unionRanges(overruns.map((o) => o.after)),
  }
}

export interface ScenarioSummary {
  scenario: Scenario
  vigEnd: number | null
  t1After: Overrun | undefined
  overruns: Overrun[]
  p3: EffItem | undefined
  /** Days between the end of P2's vigência and the start of P3 (positive = gap, negative = overlap). */
  gapToP3: number | null
  afterWindows: DayRange[]
  /** Part of the post-vigência windows that overlaps the (hypothetical) P3 period. */
  overlapWithP3: DayRange[]
}

export function summarizeScenario(doc: StudioDoc, scenarioId: string, courseId = "t1"): ScenarioSummary {
  const items = applyScenario(doc, scenarioId)
  const overruns = computeOverruns(items)
  const vig = vigenciaOf(items, "p2")
  const p3 = items.find((i) => i.id === "p3-ciclo") ?? items.find((i) => i.kind === "projeto" && i.projectId === "p3")
  const afterWindows = unionRanges(overruns.map((o) => o.after))
  return {
    scenario: getScenario(doc, scenarioId),
    vigEnd: vig ? vig.range.end : null,
    t1After: overrunFor(overruns, courseId),
    overruns,
    p3,
    gapToP3: vig && p3 ? p3.range.start - vig.range.end : null,
    afterWindows,
    overlapWithP3: p3 ? afterWindows.map((w) => intersect(w, p3.range)).filter((x): x is DayRange => !!x) : [],
  }
}

export const describeAfter = (o: Overrun) =>
  `${o.months} ${o.months === 1 ? "mês-calendário" : "meses-calendário"} (${fmtMonthsSpan(o.after)})`
