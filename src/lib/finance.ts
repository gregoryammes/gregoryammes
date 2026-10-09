import type { EffItem } from "./analysis"
import { partAfter, rangeOf, toDay, type DayRange } from "./dates"
import type { FinKind, FinRecord, Item, StudioDoc } from "@/data/types"

/* ──────────────────────────────────────────────────────────────────────────────
 * V8 — financial components of an action. Pure functions: what the records say,
 * never more. "Pago" is shown only when an acquisition record says so.
 * ────────────────────────────────────────────────────────────────────────────── */

/** Records visible in a scenario (scenario-only forecasts appear only there). */
export const finRecordsIn = (doc: StudioDoc, scenarioId?: string) => (doc.finRecords ?? []).filter((f) => !f.scenarioId || f.scenarioId === scenarioId)

export const finOf = (fins: FinRecord[], actionId: string, kind?: FinKind) => fins.filter((f) => f.actionId === actionId && (!kind || f.kind === kind))

export const acqOf = (fins: FinRecord[], actionId: string) => fins.find((f) => f.actionId === actionId && f.kind === "aquisicao")

export function finRange(f: Pick<FinRecord, "start" | "end">): DayRange | null {
  if (!f.start) return null
  try {
    const r = rangeOf(f.start, f.end ?? f.start)
    return r.end > r.start ? r : { start: r.start, end: r.start + 1 }
  } catch {
    return null
  }
}

export type TagTone = "paid" | "neutral" | "pending" | "scenario" | "warn" | "info" | "plan" | "proposal"
export interface Tag {
  label: string
  tone: TagTone
  title?: string
  /** Compact form (stamps on narrow bars). */
  short?: string
}

const stepDone = (a: FinRecord, id: string) => !!a.steps?.find((s) => s.id === id)?.done

/** Compact acquisition tag for the action row. */
export function acqTag(a: FinRecord | undefined): Tag {
  if (!a) return { label: "Pagamento a validar", tone: "neutral", title: "Nenhum registro de aquisição ou pagamento cadastrado para esta ação." }
  switch (a.acqStatus ?? "planejado") {
    case "integralmente_pago":
      return { label: "Pago", tone: "paid", title: "Aquisição registrada como integralmente paga." }
    case "parcialmente_pago":
      return { label: "Parcialmente pago", tone: "pending" }
    case "contratado":
      return { label: "Contratado", tone: "info" }
    case "cotacao":
      return { label: "Cotação", tone: "pending", title: "Cotação recebida — contratação pendente de confirmação." }
    case "em_negociacao":
      return stepDone(a, "negociacao")
        ? { label: "Compra a formalizar", tone: "pending", title: "Negociação concluída; contrato ainda não formalizado." }
        : { label: "Em negociação", tone: "pending" }
    default:
      return { label: "Compra prevista", tone: "plan" }
  }
}

/** Sum of payments linked to an acquisition — each payment record counted once. */
export function paidOf(fins: FinRecord[], a: FinRecord) {
  const pays = fins.filter((f) => f.kind === "pagamento" && f.realized && (f.parentId === a.id || (!f.parentId && f.actionId === a.actionId)))
  const valued = pays.filter((p) => p.value != null)
  return { pays, total: valued.length ? valued.reduce((s, p) => s + (p.value ?? 0), 0) : null, lastDate: pays.map((p) => p.end ?? p.start).filter(Boolean).sort().pop() ?? null }
}

/** Consistency checks between the declared state and the registered documents. */
export function acqWarnings(fins: FinRecord[], a: FinRecord): string[] {
  const out: string[] = []
  const { pays, total } = paidOf(fins, a)
  const st = a.acqStatus ?? "planejado"
  if ((st === "integralmente_pago" || st === "parcialmente_pago") && pays.length === 0) out.push("Situação “pago” sem registro de pagamento cadastrado (data e valor não informados).")
  if (st === "integralmente_pago" && a.contractValue != null && total != null && total < a.contractValue) out.push("Pagamentos registrados menores que o valor contratado.")
  if (a.proof === "pendente" && (st === "contratado" || st === "parcialmente_pago" || st === "integralmente_pago")) out.push("Comprovação documental pendente.")
  if (a.proof === "comprovado" && !a.evidence && !a.steps?.some((s) => s.id === "comprovacao" && s.done && s.evidence)) out.push("Marcado como comprovado sem documento informado.")
  if ((st === "contratado" || st === "parcialmente_pago" || st === "integralmente_pago") && !a.contractDate && !stepDone(a, "contrato")) out.push("Contrato não registrado (data e documento).")
  return out
}

/**
 * Carimbo financeiro: who funds the acquisition and in what state, read from the linked financial
 * records only — never from the bar colour, the project row or the course status.
 */
export type StampTone = "paid" | "partial" | "parcelas" | "contracted" | "quote" | "tocontract" | "undefined" | "proposal" | "validate"
export interface Stamp {
  label: string
  /** Compact form for a bar narrower than the label. */
  short: string
  tone: StampTone
  title: string
}

export function financeStamp(action: Pick<Item, "projectId" | "certainty">, acq: FinRecord | undefined, projectShort: (id: string | null | undefined) => string | null): Stamp {
  const fund = acq ? projectShort(acq.fundingProjectId) : null
  const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
  const proof = acq?.proof === "pendente" ? " — comprovação pendente" : ""
  if (!acq) {
    if (action.projectId === "p3") return { label: "P3 · Proposta", short: "P3", tone: "proposal", title: "Proposta do Projeto 3 em modelagem — sem aquisição nem aprovação." }
    // No record → no funder is named: the action's own project goes only in the tooltip.
    const p = projectShort(action.projectId)
    return p
      ? { label: "A validar", short: "?", tone: "validate", title: `Sem registro de aquisição ou pagamento cadastrado (ação do ${p}); projeto financiador não registrado.` }
      : { label: "Financiamento a definir", short: "a definir", tone: "undefined", title: "Nenhum projeto financiador nem aquisição registrados." }
  }
  const st = acq.acqStatus ?? "planejado"
  const who = fund ?? "Financiador a definir"
  if (st === "cotacao") return { label: "Cotação", short: "Cot.", tone: "quote", title: `Cotação recebida${acq.quoteValue != null ? ` (${brl(acq.quoteValue)})` : ""}; contratação pendente.` }
  if (st === "planejado" || st === "em_negociacao") return { label: "A contratar", short: "A contr.", tone: "tocontract", title: `Aquisição ainda não contratada${acq.supplier ? ` (${acq.supplier})` : ""}.` }
  if (!fund) return { label: "Financiamento a definir", short: "a definir", tone: "undefined", title: "Aquisição registrada sem projeto financiador." }
  if (st === "integralmente_pago") return { label: `${who} · Pago`, short: who, tone: "paid", title: `Aquisição registrada como integralmente paga pelo ${who}${proof}.` }
  if (st === "parcialmente_pago") return { label: `${who} · Parcial`, short: who, tone: "partial", title: `Aquisição registrada como parcialmente paga pelo ${who}${proof}.` }
  if (acq.paymentMode === "parcelas")
    return { label: `${who} · Parcelas`, short: who, tone: "parcelas", title: `Pagamento em parcelas${acq.installmentValue != null ? ` de ${brl(acq.installmentValue)}` : ""} — situação calculada pelas parcelas registradas.` }
  return { label: `${who} · Contratado`, short: who, tone: "contracted", title: `Aquisição contratada pelo ${who}${proof}.` }
}

const STAMP_TAG: Record<StampTone, TagTone> = { paid: "paid", partial: "pending", parcelas: "info", contracted: "info", quote: "pending", tocontract: "pending", undefined: "neutral", proposal: "proposal", validate: "plan" }
export const stampTag = (s: Stamp): Tag => ({ label: s.label, short: s.short, tone: STAMP_TAG[s.tone], title: s.title })

export interface ActionInfo {
  action: EffItem
  acq?: FinRecord
  fins: FinRecord[]
  bolsas: EffItem[]
  tags: Tag[]
  /** Open commitments: forecasts, unpaid installments, pending proof, grants still running. */
  open: string[]
  ended: boolean
  paid: boolean
}

/** Bolsas, milestones and turmas subordinated to an action. */
export const childItemsOf = (items: EffItem[], action: Item) => items.filter((i) => i.id !== action.id && i.parentId === action.id)

export function actionInfo(action: EffItem, items: EffItem[], fins: FinRecord[], ref: number): ActionInfo {
  const mine = finOf(fins, action.id)
  const acq = mine.find((f) => f.kind === "aquisicao")
  const bolsas = childItemsOf(items, action).filter((i) => i.kind === "bolsa")
  const tags: Tag[] = []
  const aTag = acqTag(acq)
  tags.push(aTag)
  // A paid or contracted acquisition without proof says so on the same tag.
  if (acq && acq.proof === "pendente" && ["contratado", "parcialmente_pago", "integralmente_pago"].includes(acq.acqStatus ?? "")) tags.push({ label: "Documentação pendente", tone: "warn", title: "Comprovação documental da aquisição ainda não registrada." })
  if (bolsas.length) {
    const future = bolsas.every((b) => b.certainty === "hipotese" || b.certainty === "planejado")
    tags.push({ label: future ? "Bolsas previstas" : "Bolsas vinculadas", tone: "info" })
  }
  if (mine.some((f) => f.linkStatus === "a_validar")) tags.push({ label: "Vínculo a validar", tone: "warn" })
  if (action.certainty === "hipotese" || action.changed) tags.push({ label: "Cenário", tone: "scenario" })
  const open: string[] = []
  for (const f of mine) {
    if (f.kind === "aquisicao") {
      if (f.acqStatus !== "integralmente_pago") open.push("aquisição não quitada")
      if (f.proof === "pendente") open.push("comprovação pendente")
    } else if (f.kind === "parcela") {
      if (f.parcelStatus !== "paga") open.push("parcela de bolsa em aberto")
    } else if (!f.realized) open.push(`${f.kind === "nf" ? "NF" : f.kind} prevista`)
    else if (f.proof === "pendente") open.push("comprovação pendente")
  }
  for (const b of bolsas) if (b.range.end > ref) open.push("bolsas em período futuro")
  // An approximate (undetermined) window that closed before the reference date is over too.
  const ended = action.range.end <= ref && action.certainty !== "hipotese" && action.certainty !== "planejado"
  return { action, acq, fins: mine, bolsas, tags, open: [...new Set(open)], ended, paid: acq?.acqStatus === "integralmente_pago" }
}

/** "Ocultar concluídas e pagas": only when the action ended, is paid and nothing is still open. */
export const isSettled = (info: ActionInfo) => info.ended && info.paid && info.open.length === 0

export type FinFilter = "all" | "paid" | "pending" | "future" | "validate"

export const FIN_FILTERS: { id: FinFilter; label: string; hint: string }[] = [
  { id: "all", label: "Todas as ações", hint: "Sem filtro financeiro" },
  { id: "paid", label: "Aquisição paga", hint: "Ações cuja aquisição está registrada como integralmente paga" },
  { id: "pending", label: "A adquirir / pendentes", hint: "Aquisições planejadas, em negociação, contratadas ou parcialmente pagas" },
  { id: "future", label: "Compromissos futuros", hint: "Pagamentos, NFs, parcelas e bolsas previstos após a data de referência" },
  { id: "validate", label: "Informações a validar", hint: "Sem registro de aquisição, comprovação pendente ou vínculo a validar" },
]

export function matchesFinFilter(info: ActionInfo, f: FinFilter, ref: number): boolean {
  if (f === "all") return true
  const st = info.acq?.acqStatus
  if (f === "paid") return st === "integralmente_pago"
  if (f === "pending") return !!info.acq && st !== "integralmente_pago"
  if (f === "future")
    return (
      info.fins.some((x) => x.kind !== "aquisicao" && !x.realized && (finRange(x)?.end ?? Infinity) > ref) ||
      info.fins.some((x) => x.kind === "parcela" && x.parcelStatus !== "paga") ||
      info.bolsas.some((b) => b.range.end > ref)
    )
  return !info.acq || info.acq.proof === "pendente" || info.fins.some((x) => x.linkStatus === "a_validar") || info.action.certainty === "a_validar"
}

/**
 * Totals by record id: a payment shown under its action, its project and a filter is still one
 * payment. Optionally restricted to the projects that fund it.
 */
export function finTotals(fins: FinRecord[], opts: { projects?: string[]; actionProject?: (actionId: string | null) => string | null } = {}) {
  const seen = new Set<string>()
  let paid: number | null = null
  let planned: number | null = null
  let count = 0
  for (const f of fins) {
    if (seen.has(f.id)) continue
    seen.add(f.id)
    const project = f.fundingProjectId ?? opts.actionProject?.(f.actionId) ?? null
    if (opts.projects && (!project || !opts.projects.includes(project))) continue
    if (f.kind !== "pagamento" || f.value == null) continue
    count++
    if (f.realized) paid = (paid ?? 0) + f.value
    else planned = (planned ?? 0) + f.value
  }
  return { paid, planned, count }
}

/** Part of a dated financial event after the vigência (calendar fact only). */
export const finAfter = (f: FinRecord, vig: DayRange | null) => {
  const r = finRange(f)
  return r && vig ? partAfter(r, vig) : null
}

export const dayOrNull = (iso?: string | null) => {
  if (!iso) return null
  try {
    return toDay(iso)
  } catch {
    return null
  }
}
