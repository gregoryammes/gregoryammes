import { isValidISO } from "@/lib/dates"
import { steps as emptySteps } from "@/data/v8"
import type { AcqStepId, FinKind, FinRecord, Funding, Item, StudioDoc } from "@/data/types"
import { FIN_KIND_LABEL } from "@/data/types"
import { uid } from "./store"

/**
 * Pure, all-or-nothing operations on financial records. An invalid edit returns the doc unchanged,
 * so a transaction never half-applies. Editing a record never touches the course period, the bolsas
 * or any other record.
 */

const fins = (d: StudioDoc) => d.finRecords ?? []

export function validFin(f: FinRecord): string | null {
  if (f.start && !isValidISO(f.start)) return "Data inicial inválida."
  if (f.end && !isValidISO(f.end)) return "Data final inválida."
  if (f.start && f.end && f.end < f.start) return "A data final deve ser igual ou posterior à inicial."
  if (f.end && !f.start) return "Informe a data inicial."
  if (f.value != null && (Number.isNaN(f.value) || f.value < 0)) return "Valor inválido."
  if (f.contractValue != null && (Number.isNaN(f.contractValue) || f.contractValue < 0)) return "Valor contratado inválido."
  if (f.contractDate && !isValidISO(f.contractDate)) return "Data de contratação inválida."
  for (const s of f.steps ?? []) if (s.date && !isValidISO(s.date)) return "Data de etapa inválida."
  return null
}

export function newFin(d: StudioDoc, kind: FinKind, action: Pick<Item, "id" | "projectId" | "name"> | null, extra: Partial<FinRecord> = {}): { doc: StudioDoc; id: string } {
  const id = uid(`fin-${kind}`)
  const f: FinRecord = {
    id,
    kind,
    name: kind === "aquisicao" && action ? `Aquisição — ${action.name}` : `${FIN_KIND_LABEL[kind]}${action ? ` — ${action.name}` : ""}`,
    actionId: action?.id ?? null,
    start: null,
    end: null,
    realized: false,
    value: null,
    fundingProjectId: action?.projectId ?? null,
    proof: "pendente",
    linkStatus: action ? "confirmado" : "a_validar",
    sourceIds: [],
    ...(kind === "aquisicao" ? { acqStatus: "planejado" as const, contractDate: null, contractValue: null, steps: emptySteps({}) } : {}),
    ...(kind === "parcela" ? { parcelStatus: "prevista" as const, beneficiaries: null } : {}),
    ...(kind === "material" ? { materialType: "pedagogico" as const } : {}),
    ...extra,
  }
  return { doc: { ...d, finRecords: [...fins(d), f] }, id }
}

export function patchFin(d: StudioDoc, id: string, patch: Partial<FinRecord>): StudioDoc {
  const cur = fins(d).find((f) => f.id === id)
  if (!cur) return d
  const next = { ...cur, ...patch }
  if (validFin(next)) return d
  return { ...d, finRecords: fins(d).map((f) => (f.id === id ? next : f)) }
}

/** One step at a time: completing a step never completes the others. */
export function setAcqStep(d: StudioDoc, id: string, step: AcqStepId, patch: { done?: boolean; date?: string | null; evidence?: string }): StudioDoc {
  const cur = fins(d).find((f) => f.id === id)
  if (!cur || cur.kind !== "aquisicao") return d
  const list = (cur.steps?.length ? cur.steps : emptySteps({})).map((s) => (s.id === step ? { ...s, ...patch } : s))
  return patchFin(d, id, { steps: list })
}

export function deleteFin(d: StudioDoc, id: string): StudioDoc {
  // Payments and NFs that pointed to a deleted acquisition keep existing, unlinked from it.
  return { ...d, finRecords: fins(d).filter((f) => f.id !== id).map((f) => (f.parentId === id ? { ...f, parentId: null } : f)) }
}

export function setFunding(d: StudioDoc, itemId: string, funding: Funding[]): StudioDoc {
  for (const f of funding) {
    if (f.start && !isValidISO(f.start)) return d
    if (f.end && !isValidISO(f.end)) return d
    if (f.start && f.end && f.end < f.start) return d
  }
  const map = (i: Item) => (i.id === itemId ? { ...i, funding } : i)
  return { ...d, items: d.items.map(map), scenarios: d.scenarios.map((s) => ({ ...s, added: s.added.map(map) })) }
}
