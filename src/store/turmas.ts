import { isValidISO } from "@/lib/dates"
import type { Item, StudioDoc, Turma } from "@/data/types"
import { uid } from "./store"

/** Pure, all-or-nothing operations on turmas and their links. An invalid edit returns the doc unchanged. */

function mapAllItems(d: StudioDoc, fn: (i: Item) => Item): StudioDoc {
  return {
    ...d,
    items: d.items.map(fn),
    scenarios: d.scenarios.map((s) => ({ ...s, added: s.added.map(fn) })),
  }
}

/**
 * Where a record's turma list lives: in the scenario's override when that scenario sets one (the
 * "turma 2027–2028" version of T2, for instance), otherwise on the record itself. Editing the list
 * in such a scenario never rewrites the documental baseline.
 */
function withTurmaIds(d: StudioDoc, itemId: string, scenarioId: string | null | undefined, fn: (ids: string[]) => string[]): StudioDoc {
  const sc = scenarioId ? d.scenarios.find((s) => s.id === scenarioId) : undefined
  const ov = sc?.overrides[itemId]
  if (sc && ov?.turmaIds) return { ...d, scenarios: d.scenarios.map((s) => (s === sc ? { ...s, overrides: { ...s.overrides, [itemId]: { ...ov, turmaIds: fn(ov.turmaIds!) } } } : s)) }
  return mapAllItems(d, (i) => (i.id === itemId ? { ...i, turmaIds: fn(i.turmaIds ?? []) } : i))
}

export function newTurmaFor(d: StudioDoc, offering: Item, scenarioId?: string | null): { doc: StudioDoc; id: string } {
  const id = uid("turma")
  const y0 = offering.start.slice(0, 4)
  const y1 = offering.end.slice(0, 4)
  const t: Turma = {
    id,
    name: `Turma ${offering.certainty === "hipotese" ? "prevista " : ""}${y0}${y1 !== y0 ? `–${y1}` : ""}`,
    entryYear: +y0,
    start: offering.start,
    end: offering.end,
    courseId: offering.courseId ?? null,
    offeringId: offering.id,
    projectId: offering.projectId,
    students: null,
    studentsCertainty: "nao_informado",
    stage: "tecnico",
    status: offering.certainty === "hipotese" ? "hipotese" : "a_validar",
    sourceIds: [],
    generationId: null,
  }
  const doc = withTurmaIds({ ...d, turmas: [...(d.turmas ?? []), t] }, offering.id, scenarioId, (ids) => [...new Set([...ids, id])])
  return { doc, id }
}

export function patchTurma(d: StudioDoc, id: string, patch: Partial<Turma>): StudioDoc {
  const cur = (d.turmas ?? []).find((t) => t.id === id)
  if (!cur) return d
  const next = { ...cur, ...patch }
  if (!isValidISO(next.start) || !isValidISO(next.end) || next.end < next.start) return d
  if (next.students != null && (!Number.isFinite(next.students) || next.students < 0)) return d
  let doc: StudioDoc = { ...d, turmas: (d.turmas ?? []).map((t) => (t.id === id ? next : t)) }
  // Moving a turma to another offering re-links both offerings in the same transaction.
  if (patch.offeringId !== undefined && patch.offeringId !== cur.offeringId) {
    doc = mapAllItems(doc, (i) => {
      if (i.id === cur.offeringId) return { ...i, turmaIds: (i.turmaIds ?? []).filter((x) => x !== id) }
      if (i.id === patch.offeringId) return { ...i, turmaIds: [...new Set([...(i.turmaIds ?? []), id])] }
      return i
    })
  }
  return doc
}

export function deleteTurma(d: StudioDoc, id: string): StudioDoc {
  const unlink = (i: Item) => (i.turmaIds?.includes(id) ? { ...i, turmaIds: i.turmaIds.filter((x) => x !== id) } : i)
  const doc = mapAllItems({ ...d, turmas: (d.turmas ?? []).filter((t) => t.id !== id) }, unlink)
  // Scenario overrides that list the turma lose it too: no link points to a deleted turma.
  return {
    ...doc,
    scenarios: doc.scenarios.map((s) => {
      const hit = Object.entries(s.overrides).filter(([, o]) => o.turmaIds?.includes(id))
      if (!hit.length) return s
      return { ...s, overrides: { ...s.overrides, ...Object.fromEntries(hit.map(([k, o]) => [k, { ...o, turmaIds: o.turmaIds!.filter((x) => x !== id) }])) } }
    }),
  }
}

/** Sets the turmas a record serves (offering or bolsa) — in the scenario's override when it sets them. */
export function setItemTurmas(d: StudioDoc, itemId: string, turmaIds: string[] | ((cur: string[]) => string[]), scenarioId?: string | null): StudioDoc {
  return withTurmaIds(d, itemId, scenarioId, typeof turmaIds === "function" ? turmaIds : () => turmaIds)
}
