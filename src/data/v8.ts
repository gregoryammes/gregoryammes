import type { AcqStep, AcqStepId, FinRecord, Item, StudioDoc, Turma } from "./types"
import { ACQ_STEPS } from "./types"
import { SRC_QUADRO } from "./v6"

/**
 * V8 additions — idempotent. Used by the seed and by the migration of saved documents.
 * Only what the V8 briefing states is recorded; every value it does not give stays `null`
 * ("não informado"). Nothing here is `comprovado`.
 */
export const SRC_V8 = "src-briefing-v8"
export const SRC_REUNIAO = "src-reuniao-20261002"

export const steps = (done: Partial<Record<AcqStepId, Omit<AcqStep, "id" | "done">>>): AcqStep[] =>
  ACQ_STEPS.map((s) => (done[s.id] ? { id: s.id, done: true, ...done[s.id] } : { id: s.id, done: false }))

const FIN: FinRecord[] = [
  {
    id: "fin-t1-aquisicao", kind: "aquisicao", name: "Aquisição do Curso Técnico 1", actionId: "t1",
    start: null, end: null, realized: false, value: null, fundingProjectId: "p2", proof: "pendente", linkStatus: "confirmado",
    acqStatus: "integralmente_pago", contractDate: null, contractValue: null,
    steps: steps({ pagamento: { date: null, evidence: "Indicado como pago no quadro “Tempo Vigência x Projeto” e no briefing V8 — sujeito à conferência financeira." } }),
    sourceIds: [SRC_V8, SRC_QUADRO],
    notes: "Fornecedor, datas, valores e documento comprobatório não informados. A situação “pago” vem dos registros atuais e precisa de conferência; não implica quitação das bolsas.",
  },
  {
    id: "fin-t2-aquisicao", kind: "aquisicao", name: "Aquisição do Curso Técnico 2", actionId: "t2",
    start: null, end: null, realized: false, value: null, fundingProjectId: "p2", proof: "pendente", linkStatus: "confirmado",
    supplier: "Senai", acqStatus: "em_negociacao", contractDate: null, contractValue: null,
    steps: steps({
      planejamento: { date: null, evidence: "Curso previsto no planejamento do Projeto 2 (briefing)." },
      negociacao: { date: "2026-10-02", evidence: "Reunião de 02/10/2026: negociação concluída com o Senai." },
    }),
    sourceIds: [SRC_REUNIAO],
    notes: "Previsão registrada na reunião de 02/10/2026: contrato com pagamento único e NF única. Isso não equivale a aquisição formalizada nem paga.",
  },
  {
    id: "fin-t2-pagamento", kind: "pagamento", name: "Pagamento único (previsto)", actionId: "t2", parentId: "fin-t2-aquisicao",
    start: "2026-10-02", end: "2027-06-30", dateUndetermined: true, realized: false, value: null, fundingProjectId: "p2", proof: "pendente", linkStatus: "confirmado",
    sourceIds: [SRC_REUNIAO],
    notes: "Previsto dentro da vigência do Projeto 2, a confirmar. Data não definida: a janela vai da reunião (02/10/2026) ao encerramento de referência (30/06/2027).",
  },
  {
    id: "fin-t2-nf", kind: "nf", name: "NF única (prevista)", actionId: "t2", parentId: "fin-t2-aquisicao",
    start: "2026-10-02", end: "2027-06-30", dateUndetermined: true, realized: false, value: null, fundingProjectId: "p2", proof: "pendente", linkStatus: "confirmado",
    sourceIds: [SRC_REUNIAO],
    notes: "Prevista dentro da vigência do Projeto 2. Não é uma nota emitida.",
  },
]

const SHORT: Record<string, string> = {
  "p1-jornada": "Jornada Tecnológica",
  "p1-robotica": "Robótica",
  "p1-tecnico": "Curso Técnico Piloto",
  "p1-educ": "Atividades educacionais",
  "p1-infra": "Infraestrutura",
  "p2-equipe": "Equipe e operação",
}

const T1_START_FROM = "2026-02-01"
const T1_START_TO = "2026-02-18"
const T1_REVISION = { at: "2026-10-09", field: "start" as const, from: T1_START_FROM, to: T1_START_TO, sourceId: SRC_V8, note: "Início de referência 18/02/2026 informado no briefing V8 (e no quadro de referência). Antes: fev/2026 sem dia definido." }

export function applyV8(d: StudioDoc): StudioDoc {
  const items = d.items.map((it): Item => {
    let next = it
    if (SHORT[it.id] && it.shortName === undefined) next = { ...next, shortName: SHORT[it.id] }
    // Revised once, with history, and only if the user never edited the start.
    if (it.id === "t1" && it.start === T1_START_FROM && !(it.revisions ?? []).length) next = { ...next, start: T1_START_TO, revisions: [T1_REVISION] }
    return next
  })
  const turmas = (d.turmas ?? []).map((t): Turma => (t.id === "turma-tec-2026" && t.start === T1_START_FROM ? { ...t, start: T1_START_TO } : t))
  const ids = new Set(items.map((i) => i.id))
  const fins = [...(d.finRecords ?? [])]
  for (const f of FIN) if (!fins.some((x) => x.id === f.id) && ids.has(f.actionId ?? "")) fins.push(f)
  const sources = [...d.sources]
  if (!sources.some((s) => s.id === SRC_V8))
    sources.push({ id: SRC_V8, title: "Briefing V8 — registros informados pelo usuário", kind: "informado", status: "a_validar", note: "Técnico 1: aquisição indicada como paga e início de referência 18/02/2026. Sem documento anexado." })
  if (!sources.some((s) => s.id === SRC_REUNIAO))
    sources.push({ id: SRC_REUNIAO, title: "Reunião de 02/10/2026 — Técnico 2 (ata não anexada)", kind: "informado", status: "a_validar", note: "Negociação concluída com o Senai; previsão de contrato com pagamento único e NF única." })
  return { ...d, items, turmas, finRecords: fins, sources, settings: { ...d.settings, modelVersion: 8 } }
}
