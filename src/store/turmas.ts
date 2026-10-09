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

export function newTurmaFor(d: StudioDoc, offering: Item): { doc: StudioDoc; id: string } {
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
  const doc = mapAllItems({ ...d, turmas: [...(d.turmas ?? []), t] }, (i) =>
    i.id === offering.id ? { ...i, turmaIds: [...new Set([...(i.turmaIds ?? []), id])] } : i,
  )
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
  return {
    ...mapAllItems({ ...d, turmas: (d.turmas ?? []).filter((t) => t.id !== id) }, unlink),
  }
}

/** Sets the turmas a record serves (offering or bolsa), keeping the turma's offering in sync. */
export function setItemTurmas(d: StudioDoc, itemId: string, turmaIds: string[]): StudioDoc {
  return mapAllItems(d, (i) => (i.id === itemId ? { ...i, turmaIds } : i))
}
