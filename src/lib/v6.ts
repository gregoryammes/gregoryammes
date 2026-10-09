import { calendarMonthsTouched, partAfter, partBefore, rangeOf, type DayRange } from "./dates"
import type { EffItem } from "./analysis"
import type { Certainty, Item, StudioDoc, Turma } from "@/data/types"

/** Documental vigência: always read from the baseline records, whatever scenario is active. */
export function docVigRange(doc: StudioDoc, projectId = "p2"): DayRange | null {
  const v = doc.items.find((i) => i.kind === "vigencia" && i.projectId === projectId) ?? doc.items.find((i) => i.kind === "vigencia")
  try {
    return v ? rangeOf(v.start, v.end) : null
  } catch {
    return null
  }
}

export type TemporalSituation = "dentro" | "parcial" | "integral" | "sem_ref"

export const TEMPORAL_LABEL: Record<TemporalSituation, string> = {
  dentro: "Dentro da vigência",
  parcial: "Parcialmente após a vigência",
  integral: "Integralmente após a vigência",
  sem_ref: "Sem referência temporal confirmada",
}

/** Temporal situation of a period against the vigência — a calendar fact, never a financial one. */
export function temporalSituation(range: DayRange, vig: DayRange | null, undetermined?: boolean) {
  if (!vig || undetermined) return { key: "sem_ref" as TemporalSituation, months: 0, after: null }
  const after = partAfter(range, vig)
  const before = partBefore(range, { start: vig.end, end: vig.end })
  const key: TemporalSituation = !after ? "dentro" : before && before.end > before.start && range.start < vig.end ? "parcial" : "integral"
  return { key, months: calendarMonthsTouched(after), after }
}

const DOCUMENTED: Certainty[] = ["comprovado", "formalizado", "executado"]
export const isDocumented = (c?: Certainty) => !!c && DOCUMENTED.includes(c)

export const turmasOf = (doc: StudioDoc, it: Pick<Item, "id" | "turmaIds">): Turma[] => {
  const ids = new Set(it.turmaIds ?? [])
  return (doc.turmas ?? []).filter((t) => ids.has(t.id) || t.offeringId === it.id)
}

export const turmaShort = (t: Turma) => t.name.replace(/^Turma\s+(Técnico\s+)?/i, "Turma ")

/** Students appear on bars only when the number itself is documented. */
export const studentsShown = (t: Turma) => t.students != null && isDocumented(t.studentsCertainty)

export function shortNameOf(it: Pick<Item, "name" | "shortName">) {
  return it.shortName ?? it.name.replace(/^Curso\s+/i, "").replace(/\s+—\s+cenário$/i, "")
}

/** "Técnico 1 · Turma 2026–2027 [· 27 alunos]" — bars use the short form, panels the full name. */
export function offeringLabel(doc: StudioDoc, it: EffItem | Item, withStudents = true) {
  const short = shortNameOf(it)
  if (it.kind !== "curso") return short
  const ts = turmasOf(doc, it)
  if (!ts.length) return `${short} · Turma a identificar`
  const t = ts.map(turmaShort).join(" + ")
  const students = withStudents && ts.length === 1 && studentsShown(ts[0]) ? ` · ${ts[0].students} alunos` : ""
  return `${short} · ${t}${students}`
}

/** Records related to any of the given turmas (offering, its bolsas, linked records). */
export function relatedToTurmas(doc: StudioDoc, it: EffItem | Item, turmaIds: string[]) {
  if (!turmaIds.length) return true
  const set = new Set(turmaIds)
  if ((it.turmaIds ?? []).some((t) => set.has(t))) return true
  const ts = (doc.turmas ?? []).filter((t) => set.has(t.id))
  if (ts.some((t) => t.offeringId === it.id)) return true
  if (it.parentId && ts.some((t) => t.offeringId === it.parentId)) return true
  return false
}

export interface ConsolidationSummary {
  members: EffItem[]
  periods: number
  /** Sum of documented student counts per record — not distinct students. */
  recordStudents: number | null
  partners: string[]
}

export function summarizeConsolidation(items: EffItem[], key: string): ConsolidationSummary {
  const members = items.filter((i) => i.consolidation === key).sort((a, b) => a.range.start - b.range.start)
  const counted = members.filter((m) => m.students != null)
  return {
    members,
    periods: members.length,
    recordStudents: counted.length ? counted.reduce((s, m) => s + (m.students ?? 0), 0) : null,
    partners: [...new Set(members.map((m) => m.partner).filter((x): x is string => !!x))],
  }
}
