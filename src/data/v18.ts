import type { FinRecord, Item, Quadrant, Revision, Scenario, StudioDoc, Turma } from "./types"
import { steps } from "./v8"

/**
 * V18 additions — idempotent. Records only what the V18 briefing states. Dates the briefing gives
 * only as a year are drawn as approximate periods (`dateUndetermined`), never pinned to a day.
 * Values the briefing gives are "informed", not proven: proof stays "pendente".
 */
export const SRC_V18 = "src-briefing-v18"
export const SCENARIO_TEC_2027 = "cen-tecnico-2027"

const AT = "2026-10-09"
const NOTE_P1 = "Histórico fornecido no briefing V18: realização do Projeto 1, concluída. Datas específicas não informadas — período aproximado ao ano."
const NOTE_P1_ACQ = "Histórico fornecido: aquisição concluída e paga. Valor, data e documentos comprobatórios a anexar."

const year = (y: number) => ({ start: `${y}-01-01`, end: `${y}-12-31`, precision: "year" as const, dateUndetermined: true })

function rev(field: "start" | "end", from: string, to: string, note: string): Revision {
  return { at: AT, field, from, to, sourceId: SRC_V18, note }
}

const base = (p: Partial<Item> & Pick<Item, "id" | "name" | "kind" | "start" | "end">): Item => ({
  layer: p.kind === "operacao" ? "operacao" : "formacao",
  lane: 0,
  projectId: null,
  precision: "month",
  certainty: "a_validar",
  sourceIds: [SRC_V18],
  ...p,
})

const NEW_ITEMS: Item[] = [
  base({ id: "p1-jornada-2", name: "2ª Jornada Tecnológica", shortName: "2ª Jornada", kind: "atividade", projectId: "p1", modality: "jornada", certainty: "executado", ...year(2024), notes: NOTE_P1 }),
  base({
    id: "jornada-2025", name: "3ª Jornada Tecnológica", shortName: "3ª Jornada", kind: "atividade", modality: "jornada", ...year(2025),
    notes: "Edição de 2025 citada no briefing V18. Projeto financiador não informado (2025 é ano de transição entre P1 e P2) — a definir pelo cadastro documental.",
  }),
  base({
    id: "jornada-2026", name: "4ª Jornada Tecnológica", shortName: "4ª Jornada", kind: "atividade", projectId: "p2", modality: "jornada", ...year(2026),
    notes: "Edição de 2026 (ciclo do Projeto 2, que lista Jornadas Tecnológicas entre suas ações). Financiamento não registrado.",
  }),
  base({
    id: "jornada-5", name: "5ª Jornada Tecnológica — planejamento a validar", shortName: "5ª Jornada", kind: "atividade", modality: "jornada", certainty: "planejado", ...year(2027),
    notes: "Planejamento a validar. O briefing não informa o período: o ano de 2027 é só uma posição provisória pela cadência anual das edições — ajuste quando houver data.",
  }),
  base({
    id: "rob-2026", name: "Robótica 2026", shortName: "Robótica 2026", kind: "atividade", projectId: "p2", modality: "robotica", start: "2026-03-14", end: "2026-12-31", precision: "day",
    notes: "Início informado: 14/03/2026. Término não informado — dez/2026 é referência pelo nome da turma, a validar. Pagamentos mensais ao SENAI.",
  }),
  base({
    id: "rob-2027", name: "Robótica 2027", shortName: "Robótica 2027", kind: "atividade", modality: "robotica", certainty: "planejado", ...year(2027),
    notes: "Cotação informada; contratação pendente de confirmação. Período e projeto financiador não definidos.",
  }),
  base({ id: "desp-p1", name: "Período Despertar", shortName: "Período Despertar", kind: "atividade", projectId: "p1", modality: "outras", certainty: "executado", start: "2023-01-01", end: "2025-12-31", precision: "year", dateUndetermined: true, notes: NOTE_P1 }),
  base({ id: "talentos-p1", name: "Desenvolvimento e contratação de talentos", shortName: "Talentos (P1)", kind: "atividade", projectId: "p1", modality: "outras", certainty: "executado", start: "2023-01-01", end: "2025-12-31", precision: "year", dateUndetermined: true, notes: NOTE_P1 }),
]

const p1Acq = (actionId: string, name: string): FinRecord => ({
  id: `fin-${actionId}-aquisicao`, kind: "aquisicao", name, actionId, start: null, end: null, realized: false, value: null,
  fundingProjectId: "p1", proof: "pendente", linkStatus: "confirmado", acqStatus: "integralmente_pago", contractDate: null, contractValue: null,
  steps: steps({ pagamento: { date: null, evidence: "Histórico fornecido no briefing V18: aquisições do Projeto 1 concluídas e pagas." } }),
  sourceIds: [SRC_V18], notes: NOTE_P1_ACQ,
})

const NEW_FINS: FinRecord[] = [
  p1Acq("p1-jornada", "Aquisição — 1ª Jornada Tecnológica"),
  p1Acq("p1-jornada-2", "Aquisição — 2ª Jornada Tecnológica"),
  p1Acq("p1-robotica", "Aquisição — Robótica 2024"),
  p1Acq("p1-tecnico", "Aquisição — Curso Técnico 2024–2025"),
  p1Acq("p1-infra", "Aquisição — Laboratório de informática"),
  {
    id: "fin-t1-pagamento", kind: "pagamento", name: "Pagamento antecipado — Técnico 1", actionId: "t1", parentId: "fin-t1-aquisicao",
    start: "2025-09-01", end: "2025-09-30", precision: "month", realized: true, value: 298012, fundingProjectId: "p2", proof: "pendente", linkStatus: "confirmado",
    sourceIds: [SRC_V18], notes: "Pagamento antecipado informado em setembro/2025 (dia não informado). Comprovante a anexar.",
  },
  {
    id: "fin-rob-2026-aquisicao", kind: "aquisicao", name: "Aquisição — Robótica 2026", actionId: "rob-2026", start: null, end: null, realized: false, value: null,
    fundingProjectId: "p2", proof: "pendente", linkStatus: "confirmado", supplier: "SENAI", acqStatus: "contratado", paymentMode: "parcelas", installmentValue: 4480,
    contractDate: null, contractValue: null, steps: steps({}), sourceIds: [SRC_V18],
    notes: "Pagamentos mensais ao SENAI de R$ 4.480 (informado). A situação financeira é calculada pelas parcelas registradas — nenhuma parcela cadastrada ainda.",
  },
  {
    id: "fin-rob-2027-aquisicao", kind: "aquisicao", name: "Cotação — Robótica 2027", actionId: "rob-2027", start: null, end: null, realized: false, value: null,
    fundingProjectId: null, proof: "pendente", linkStatus: "confirmado", acqStatus: "cotacao", quoteValue: 44800, contractDate: null, contractValue: null,
    steps: steps({ proposta: { date: null, evidence: "Cotação de R$ 44.800 informada no briefing V18." } }), sourceIds: [SRC_V18],
    notes: "Cotação informada: R$ 44.800. Contratação pendente de confirmação; projeto financiador a definir.",
  },
]

const TURMAS: Turma[] = [
  {
    id: "turma-tec-2024", name: "Turma Técnico 2024–2025", entryYear: 2024, start: "2024-01-01", end: "2025-12-31", courseId: "curso-tecnico", offeringId: "p1-tecnico",
    projectId: "p1", students: null, studentsCertainty: "nao_informado", stage: "tecnico", status: "executado", sourceIds: [SRC_V18],
    notes: "Turma 2024–2025 do Projeto 1 (briefing V18). Datas de início e fim a validar.", generationId: null,
  },
  {
    id: "turma-tec-2028", name: "Turma prevista 2028–2029", entryYear: 2028, start: "2028-01-01", end: "2029-12-31", courseId: "curso-tecnico", offeringId: "t2",
    projectId: null, students: null, studentsCertainty: "nao_informado", stage: "tecnico", status: "hipotese", sourceIds: [SRC_V18],
    notes: "Turma proposta no planejamento mais recente. Aquisição e financiamento não decididos.", generationId: null,
  },
]

/** Two examples from the briefing. Visual only; both follow the active scenario. */
export const SEED_QUADRANTS: Quadrant[] = [
  {
    id: "q-apos-vigencia-p2", title: "Após a vigência do Projeto 2", description: "Período de formação posterior ao encerramento de referência, conforme o cenário ativo. Fato de calendário — não indica falta de cobertura.",
    mode: "auto", rule: { kind: "after_vigencia", projectId: "p2" }, start: "2027-07-01", end: "2027-12-31", rowFrom: null, rowTo: null,
    color: "#F28C28", opacity: 0.08, stroke: "none", layer: 0, showTitle: true,
  },
  {
    id: "q-projeto3", title: "Projeto 3 — Proposta", description: "Período do Projeto 3 no cenário selecionado. Em modelagem, sem aprovação.",
    mode: "auto", rule: { kind: "project_period", projectId: "p3" }, start: "2027-07-01", end: "2030-06-30", rowFrom: null, rowTo: null,
    color: "#8870B5", opacity: 0.05, stroke: "dashed", strokeColor: "#8870B5", layer: 1, showTitle: true,
  },
]

const unchanged = (it: Item | undefined, start: string, end: string) => !!it && it.start === start && it.end === end && !(it.revisions ?? []).length

export function applyV18(d: StudioDoc): StudioDoc {
  const byId = new Map(d.items.map((i) => [i.id, i]))
  const items = d.items.map((it): Item => {
    let n = it
    switch (it.id) {
      case "p1-ciclo":
        if (it.certainty === "a_validar") n = { ...n, certainty: "executado", notes: `${it.notes ? `${it.notes} ` : ""}Situação informada no briefing V18: concluído.` }
        break
      case "p1-jornada":
        if (unchanged(it, "2023-01-01", "2025-12-31"))
          n = { ...n, name: "1ª Jornada Tecnológica", shortName: "1ª Jornada", certainty: "executado", ...year(2023), notes: NOTE_P1,
            revisions: [rev("end", it.end, "2023-12-31", "O briefing V18 detalha as edições: 1ª Jornada em 2023 (as demais têm registro próprio).")] }
        break
      case "p1-robotica":
        if (unchanged(it, "2023-01-01", "2025-12-31"))
          n = { ...n, name: "Robótica 2024", shortName: "Robótica 2024", certainty: "executado", ...year(2024), notes: NOTE_P1,
            revisions: [rev("start", it.start, "2024-01-01", "Briefing V18: Robótica 2024."), rev("end", it.end, "2024-12-31", "Briefing V18: Robótica 2024.")] }
        break
      case "p1-tecnico":
        if (unchanged(it, "2023-01-01", "2025-12-31"))
          n = { ...n, kind: "curso", name: "Curso Técnico — Turma 2024–2025", shortName: "Técnico 2024–2025", certainty: "executado", start: "2024-01-01", end: "2025-12-31",
            precision: "year", dateUndetermined: true, courseId: "curso-tecnico", turmaIds: ["turma-tec-2024"], notes: NOTE_P1,
            revisions: [rev("start", it.start, "2024-01-01", "Briefing V18: Curso Técnico — turma 2024–2025 (dois anos, uma única aquisição).")] }
        break
      case "p1-infra":
        if (it.shortName === "Infraestrutura" || it.shortName === undefined) n = { ...n, shortName: "Laboratório de informática", certainty: it.certainty === "a_validar" ? "executado" : it.certainty, notes: `${it.notes ?? ""} Briefing V18: laboratório de informática do Projeto 1 (a conciliar com este registro de infraestrutura).`.trim() }
        break
      case "t1-bolsas":
        if (!/unidades curriculares/.test(it.conditions ?? "")) n = { ...n, conditions: `${it.conditions ? `${it.conditions} ` : ""}Pagas conforme critérios de frequência e unidades curriculares (briefing V18).` }
        break
      case "t2":
        // Most recent planning: turma 2028–2029. The earlier 2027–2028 version is kept as its own scenario.
        if (unchanged(it, "2027-02-01", "2028-12-31"))
          n = { ...n, shortName: it.shortName ?? "Técnico 2", start: "2028-01-01", end: "2029-12-31", precision: "year", dateUndetermined: true, turmaIds: ["turma-tec-2028"],
            notes: "Planejamento mais recente (briefing V18): turma proposta para 2028–2029. Aquisição ainda não decidida; formato discutido com o SENAI: pagamento único e NF única. A versão 2027–2028 dos registros anteriores está no cenário próprio.",
            revisions: [rev("start", it.start, "2028-01-01", "Briefing V18: turma proposta para 2028–2029 no planejamento mais recente."), rev("end", it.end, "2029-12-31", "Briefing V18: turma proposta para 2028–2029.")] }
        break
      case "t2-bolsas":
        if (unchanged(it, "2027-02-01", "2028-12-31"))
          n = { ...n, start: "2028-01-01", end: "2029-12-31", precision: "year", dateUndetermined: true,
            revisions: [rev("start", it.start, "2028-01-01", "Acompanha a turma 2028–2029."), rev("end", it.end, "2029-12-31", "Acompanha a turma 2028–2029.")] }
        break
    }
    return n
  })
  const ids = new Set(items.map((i) => i.id))
  const added = NEW_ITEMS.filter((i) => !ids.has(i.id))
  const allIds = new Set([...ids, ...added.map((i) => i.id)])

  const fins = [...(d.finRecords ?? [])].map((f) =>
    f.id === "fin-t1-aquisicao" && f.contractValue == null
      ? { ...f, contractValue: 298012, steps: (f.steps ?? []).map((s) => (s.id === "pagamento" && s.done && !s.date ? { ...s, evidence: "Pagamento antecipado informado em setembro/2025 (briefing V18)." } : s)), notes: "Aquisição informada: R$ 298.012, paga antecipadamente em setembro/2025 pelo Projeto 2 (briefing V18). Documentos comprobatórios a anexar. Não implica quitação das bolsas." }
      : f,
  )
  for (const f of NEW_FINS) if (!fins.some((x) => x.id === f.id) && allIds.has(f.actionId ?? "")) fins.push(f)

  const turmas = (d.turmas ?? []).map((t) =>
    t.id === "turma-tec-2027" && t.offeringId === "t2" && byId.get("t2")?.start === "2027-02-01"
      ? { ...t, offeringId: null, notes: `${t.notes ? `${t.notes} ` : ""}Versão dos registros anteriores (2027–2028), preservada no cenário “Técnico futuro — turma 2027–2028”.` }
      : t,
  )
  for (const t of TURMAS) if (!turmas.some((x) => x.id === t.id) && allIds.has(t.offeringId ?? "")) turmas.push(t)

  const scenarios: Scenario[] = [...d.scenarios]
  const t2Before = byId.get("t2")
  if (!scenarios.some((s) => s.id === SCENARIO_TEC_2027) && t2Before && t2Before.start === "2027-02-01")
    scenarios.push({
      id: SCENARIO_TEC_2027,
      name: "Técnico futuro — turma 2027–2028 (registros anteriores)",
      kind: "alternative",
      description: "Versão anterior do planejamento do Técnico futuro (turma 2027–2028), preservada como cenário distinto. Não representa contratação.",
      overrides: {
        t2: { start: "2027-02-01", end: "2028-12-31", precision: "month", dateUndetermined: false, turmaIds: ["turma-tec-2027"] },
        "t2-bolsas": { start: "2027-02-01", end: "2028-12-31", precision: "month", dateUndetermined: false },
      },
      added: [],
      removed: [],
    })

  const sources = d.sources.some((s) => s.id === SRC_V18)
    ? d.sources
    : [...d.sources, { id: SRC_V18, title: "Briefing V18 — histórico do P1 e dados do ciclo atual (informado pelo usuário)", kind: "informado" as const, status: "a_validar" as const, note: "Valores e datas informados, a conciliar com contratos, NFs e comprovantes." }]

  // The V3 example callout ("Formação prossegue…") is now said by the auto quadrant; its text moves
  // there, only if the user never edited or moved it.
  const OLD_ANN = "Formação prossegue após o fim da vigência de referência"
  const old = d.annotations.find((x) => x.id === "ann-t1" && x.text === OLD_ANN && x.offsetDays === 890 && x.y === -2)
  const annotations = old ? d.annotations.filter((x) => x !== old) : d.annotations
  const quadrants = d.quadrants ?? SEED_QUADRANTS.map((q) => (q.id === "q-apos-vigencia-p2" && old ? { ...q, description: `${OLD_ANN}. ${q.description ?? ""}`.trim() } : q))

  return { ...d, items: [...items, ...added], finRecords: fins, turmas, scenarios, sources, annotations, quadrants, settings: { ...d.settings, modelVersion: 18 } }
}
