import type { Item, StudioDoc } from "./types"

/**
 * Seed data. Everything here comes from the briefing text ("Prompt Master V3"); no documents were
 * attached to the session, so nothing is marked `comprovado` or `formalizado`. Dates that the
 * briefing gives only as a general period are drawn with `dateUndetermined` and never pinned.
 */

export const COLORS = {
  navy: "#0A1633",
  corporate: "#1F4FD1",
  tech: "#2EA8FF",
  orange: "#FF7A1A",
  p1: "#23845D",
  p2: "#087CB8",
  p3: "#173B63",
}

const SRC_BRIEF = "src-briefing"
const SRC_PREV = "src-materiais"
const SRC_BUDGET = "src-orcamento"
const SRC_INSTR = "src-instrumento"

const base = (p: Partial<Item> & Pick<Item, "id" | "name" | "kind" | "layer" | "start" | "end">): Item => ({
  lane: 0,
  projectId: null,
  precision: "month",
  certainty: "a_validar",
  sourceIds: [SRC_BRIEF],
  ...p,
})

const p1Action = (id: string, name: string, lane: number, layer: Item["layer"] = "formacao"): Item =>
  base({
    id,
    name,
    kind: layer === "operacao" ? "operacao" : "atividade",
    layer,
    lane,
    projectId: "p1",
    start: "2023-01-01",
    end: "2025-12-31",
    precision: "year",
    dateUndetermined: true,
    certainty: "a_validar",
    notes: "Ação citada no histórico do Projeto 1. Datas específicas não comprovadas: exibida apenas dentro do período geral 2023–2025.",
  })

export function createSeed(): StudioDoc {
  const items: Item[] = [
    // ── Projetos ──────────────────────────────────────────────────────────────
    base({
      id: "p1-ciclo", name: "Projeto 1 — Fundação e histórico", kind: "projeto", layer: "projetos", lane: 0,
      projectId: "p1", start: "2023-01-01", end: "2025-12-31", precision: "year", certainty: "a_validar",
      description: "Primeiro ciclo histórico do SKA Tech Hub. Período geral de referência.",
    }),
    base({
      id: "p2-ciclo", name: "Projeto 2 — Consolidação e formação", kind: "projeto", layer: "projetos", lane: 1, detail: true,
      projectId: "p2", start: "2025-01-01", end: "2027-12-31", precision: "year", certainty: "a_validar",
      description: "Ciclo atual. Período geral de referência 2025–2027.",
      finance: {
        planned: 3_750_000, paid: null, status: "nao_confirmado",
        note: "Orçamento demonstrativo citado em prompt anterior. NÃO é valor oficial até conciliação com a documentação.",
      },
      sourceIds: [SRC_BRIEF, SRC_BUDGET],
    }),
    base({
      id: "p3-ciclo", name: "Projeto 3 — Continuidade e inovação (proposta)", kind: "projeto", layer: "projetos", lane: 6,
      projectId: "p3", start: "2027-07-01", end: "2030-06-30", precision: "month", certainty: "hipotese",
      contractStatus: "nao_confirmado",
      description: "Proposta em desenvolvimento: continuidade formativa, pesquisa aplicada, inovação, IA. Duração-hipótese de 36 meses, início simulado.",
      notes: "Aprovação, valores e vigência não presumidos. Datas = hipótese de planejamento.",
    }),

    // ── Planejamento ─────────────────────────────────────────────────────────
    base({
      id: "p2-plano", name: "Planejamento original — Projeto 2", kind: "planejamento", layer: "planejamento", lane: 2,
      projectId: "p2", start: "2025-01-01", end: "2026-12-31", certainty: "planejado",
      description: "Planejamento original previa atividades entre janeiro/2025 e dezembro/2026.",
    }),
    base({
      id: "p2-operacional", name: "Período operacional (materiais anteriores)", kind: "planejamento", layer: "planejamento", lane: 3, detail: true,
      projectId: "p2", start: "2025-07-01", end: "2027-06-30", certainty: "a_validar",
      description: "Período jul/2025–jun/2027 existente em materiais anteriores.",
      notes: "Conciliar documentalmente com o marco de 31/05/2025 — não presumir mesma natureza.",
      sourceIds: [SRC_PREV],
    }),

    // ── Vigências ────────────────────────────────────────────────────────────
    base({
      id: "p2-vigencia", name: "Vigência de referência — Projeto 2", kind: "vigencia", layer: "vigencias", lane: 4,
      projectId: "p2", start: "2025-05-31", end: "2027-06-30", precision: "day", certainty: "a_validar",
      contractStatus: "a_validar",
      description: "Encerramento de referência 30/06/2027, sujeito à validação do instrumento e de eventuais aditivos.",
      notes: "Início jurídico NÃO confirmado: 31/05/2025 usado apenas como referência visual do marco informado. Encerramento editável somente em cenário.",
      sourceIds: [SRC_BRIEF, SRC_INSTR],
    }),
    base({
      id: "p2-marco-0531", name: "Marco de 31/05/2025 (natureza a conciliar)", kind: "marco", layer: "vigencias", lane: 5,
      projectId: "p2", start: "2025-05-31", end: "2025-05-31", precision: "day", certainty: "a_validar",
      description: "Marco informado no histórico de referência. Assinatura, aprovação ou início de vigência? A conciliar.",
    }),

    // ── Formação ─────────────────────────────────────────────────────────────
    p1Action("p1-jornada", "Jornada Tecnológica (P1)", 0),
    p1Action("p1-robotica", "Robótica (P1)", 1),
    p1Action("p1-tecnico", "Curso Técnico (P1)", 2),
    p1Action("p1-educ", "Atividades educacionais (P1)", 3),
    base({
      id: "t1", name: "Curso Técnico 1", kind: "curso", layer: "formacao", lane: 4,
      projectId: "p2", start: "2026-02-01", end: "2027-12-31", certainty: "a_validar",
      contractStatus: "nao_informado",
      finance: { planned: null, paid: null, status: "nao_informado", note: "Situação financeira distinta da pedagógica — registrar quando documentada." },
      students: null,
      description: "Formação iniciada em 2026, com previsão de continuidade até dezembro/2027.",
      notes: "Período de referência fev/2026–dez/2027 sujeito à verificação documental. Mesmo integralmente pago, a execução pedagógica pode continuar.",
    }),

    // ── Bolsas ───────────────────────────────────────────────────────────────
    base({
      id: "t1-bolsas", name: "Bolsas — Técnico 1", kind: "bolsa", layer: "bolsas", lane: 0,
      projectId: "p2", parentId: "t1", start: "2026-02-01", end: "2027-12-31", certainty: "a_validar",
      conditions: "Vinculadas a critérios de frequência e desempenho; podem exigir pagamentos periódicos.",
      finance: { planned: null, paid: null, status: "nao_informado" },
      notes: "Período registrado ≠ bolsa devida. Elegibilidade depende das condições aplicáveis.",
    }),

    // ── Operação ─────────────────────────────────────────────────────────────
    p1Action("p1-infra", "Infraestrutura (P1)", 0, "operacao"),
    base({
      id: "p2-equipe", name: "Equipe e operação — Projeto 2", kind: "operacao", layer: "operacao", lane: 1,
      projectId: "p2", start: "2025-07-01", end: "2027-06-30", certainty: "nao_confirmado",
      contractStatus: "nao_informado",
      notes: "Período estimado a partir do período operacional. Validar contratos de equipe, estrutura e serviços.",
      sourceIds: [SRC_PREV],
    }),

    // ── Cenários ─────────────────────────────────────────────────────────────
    base({
      id: "t2", name: "Curso Técnico 2 — cenário", kind: "curso", layer: "formacao", lane: 5,
      projectId: "p2", start: "2027-02-01", end: "2028-12-31", certainty: "hipotese",
      contractStatus: "nao_confirmado",
      finance: { planned: null, paid: null, status: "nao_informado" },
      description: "Previsto no planejamento, com horizonte educacional potencial até 2028.",
      notes: "Pendente de confirmação contratual e de definição de execução. Início em fev/2027 é hipótese de simulação. Não afirmar contratação.",
    }),
    base({
      id: "t2-bolsas", name: "Bolsas — Técnico 2 (cenário)", kind: "bolsa", layer: "bolsas", lane: 1,
      projectId: "p2", parentId: "t2", start: "2027-02-01", end: "2028-12-31", certainty: "hipotese",
      conditions: "Condicionadas à contratação do curso e aos critérios aplicáveis.",
    }),
  ]

  return {
    schema: "ska-temporal-studio/1",
    meta: { name: "SKA Tech Hub — Projetos 1, 2 e 3", updatedAt: new Date().toISOString() },
    settings: {
      referenceDate: "2026-10-08",
      snap: "month",
      layersHidden: [],
      layersCollapsed: [],
      layout: "groups-v2",
      groupsHidden: [],
      groupsCollapsed: [],
      groupsDetailed: [],
      journeyCohorts: { from: 2022, to: 2026 },
      boardRange: { start: 2023, end: 2030 },
      cohortStartYear: 2024,
    },
    projects: [
      { id: "p1", name: "Projeto 1", short: "P1", phase: "Fundação e histórico", color: COLORS.p1, description: "Primeiro ciclo histórico (2023–2025)." },
      { id: "p2", name: "Projeto 2", short: "P2", phase: "Consolidação e formação", color: COLORS.p2, description: "Ciclo atual (2025–2027)." },
      { id: "p3", name: "Projeto 3", short: "P3", phase: "Próximo ciclo", color: COLORS.p3, description: "Proposta em desenvolvimento — não aprovada." },
    ],
    items,
    scenarios: [
      {
        id: "baseline", name: "Linha de base documental", kind: "baseline",
        description: "Registros como cadastrados. Vigências não se alteram aqui.",
        overrides: {}, added: [], removed: [],
      },
      {
        id: "working", name: "Cenário de trabalho", kind: "working",
        description: "Espaço livre de simulação. Toda alteração é hipótese.",
        overrides: {}, added: [], removed: [],
      },
      {
        id: "alt-prorrogacao", name: "Alternativo — prorrogação simulada + P3 em 2028", kind: "alternative",
        description: "Simula vigência até 31/12/2027 e Projeto 3 iniciando em jan/2028. Não representa aprovação.",
        overrides: {
          "p2-vigencia": { end: "2027-12-31" },
          "p3-ciclo": { start: "2028-01-01", end: "2030-12-31" },
        },
        added: [], removed: [],
      },
    ],
    annotations: [
      {
        id: "ann-t1", kind: "callout", text: "Formação prossegue após o fim da vigência de referência",
        date: "2027-07-01", y: -2, linkedItemId: "t1", offsetDays: 890, width: 250,
      },
    ],
    links: [
      { id: "lk-t1-bolsas", from: "t1", to: "t1-bolsas", label: "bolsas do curso" },
      { id: "lk-p2-p3", from: "p2-ciclo", to: "p3-ciclo", label: "continuidade" },
    ],
    sources: [
      { id: SRC_BRIEF, title: "Histórico de referência informado no briefing (Prompt Master V3)", kind: "informado", status: "a_validar", note: "Nenhum documento oficial foi anexado nesta sessão." },
      { id: SRC_PREV, title: "Materiais anteriores — período operacional jul/2025–jun/2027", kind: "material_anterior", status: "a_validar" },
      { id: SRC_BUDGET, title: "Orçamento demonstrativo de R$ 3.750.000,00 (prompt anterior)", kind: "material_anterior", status: "nao_confirmado", note: "Não tratar como valor oficial sem conciliação." },
      { id: SRC_INSTR, title: "Instrumento do Projeto 2 e eventuais aditivos", kind: "documento", status: "nao_informado", note: "Não anexado — necessário para validar a vigência." },
    ],
    decisions: [
      { id: "d-t1", title: "Continuidade do Curso Técnico 1 após a vigência", topic: "curso", status: "pendente", relatedItemIds: ["t1", "p2-vigencia"], description: "Definir como a formação será assegurada no período posterior ao encerramento de referência." },
      { id: "d-bolsas", title: "Bolsas e incentivos no período posterior", topic: "bolsas", status: "pendente", relatedItemIds: ["t1-bolsas"], description: "Verificar condições, previsão e cobertura das bolsas vinculadas à frequência e ao desempenho." },
      { id: "d-oper", title: "Cobertura operacional (equipe, estrutura, serviços)", topic: "operacao", status: "pendente", relatedItemIds: ["p2-equipe"], description: "Confirmar contratos e períodos de operação necessários à formação em andamento." },
      { id: "d-t2", title: "Confirmação contratual do Curso Técnico 2", topic: "curso", status: "pendente", relatedItemIds: ["t2", "t2-bolsas"], description: "Previsão orçamentária ≠ contratação ≠ execução. Definir execução e cronograma." },
      { id: "d-p3", title: "Planejamento e formalização do Projeto 3", topic: "projeto3", status: "em_analise", relatedItemIds: ["p3-ciclo"], description: "Definir início, duração e escopo — hoje hipótese de 36 meses." },
      { id: "d-adm", title: "Alternativas administrativas documentadas", topic: "administrativo", status: "pendente", relatedItemIds: ["p2-vigencia"], description: "Levantar alternativas previstas na documentação aplicável. Análise jurídica necessária — o sistema não conclui." },
    ],
    presentation: { layout: {}, notes: [], highlightCourseIds: ["t1"] },
  }
}
