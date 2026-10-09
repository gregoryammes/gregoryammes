import type { Decision, Idea, PillarId, Scenario, StudioDoc, Strategy } from "./types"
import { modalityOf } from "./types"
import { SRC_REUNIAO } from "./v8"

/**
 * V11 additions — idempotent. Used by the seed and by the migration of saved documents.
 * The Projeto 3 proposals are the ones listed in the V11 briefing, all as "Ideia": no dates, no
 * costs, no owner. Milestones come from the minutes of 02/10/2026 and start as "Previsto".
 */
export const SRC_V11 = "src-briefing-v11"
export const SCENARIO_B = "cen-b-projeto3"

const PROPOSALS: Record<Exclude<PillarId, "transversal">, string[]> = {
  formacao: [
    "Manter a Jornada Tecnológica",
    "Manter e aperfeiçoar a Robótica",
    "Avaliar novas turmas de cursos técnicos",
    "Explorar cursos para a comunidade",
    "Formações complementares ligadas à indústria",
  ],
  talentos: ["Programa de jovens aprendizes", "Estágios", "Monitoria", "Possível efetivação de talentos", "Desenvolvimento profissional vinculado à SKA"],
  infraestrutura: ["Reforma ou ampliação do escritório", "Uso do segundo espaço", "Laboratórios", "Ambientes de experimentação", "Equipamentos e infraestrutura"],
  ia: [
    "Formação em IA",
    "IA aplicada à indústria",
    "IA aplicada ao desenvolvimento de software",
    "Automação",
    "Pesquisa aplicada",
    "Projetos reais com equipes da SKA",
    "Licenças e ferramentas de inovação",
  ],
}
const TRANSVERSAL = ["Sustentabilidade", "Custos operacionais", "Governança", "Prestação de contas"]

const slug = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40)

function seedIdeas(): Idea[] {
  const out: Idea[] = []
  for (const [pillar, names] of Object.entries(PROPOSALS) as [PillarId, string[]][])
    names.forEach((name, i) => out.push({ id: `idea-${slug(name)}`, name, pillar, priority: null, status: "ideia", order: i, cost: null, start: null, end: null, source: "Lista de propostas do briefing V11" }))
  TRANSVERSAL.forEach((name, i) => out.push({ id: `idea-${slug(name)}`, name, pillar: "transversal", priority: null, status: "ideia", order: i, cost: null, start: null, end: null, source: "Dimensão transversal do briefing V11" }))
  return out
}

export function seedStrategy(): Strategy {
  return {
    premiseYears: 3,
    premiseNote: "Duração de três anos como premissa de planejamento, editável e sujeita à legislação aplicável.",
    encaminhamento:
      "A reunião de 02/10/2026 registrou encaminhamento favorável à estruturação do Projeto 3, diante da insuficiência de recursos para despesas adicionais mesmo com prorrogação do Projeto 2.",
    encaminhamentoSourceId: SRC_REUNIAO,
    leadershipValidation: { status: "pendente", note: "Validação interna pela liderança: etapa própria, ainda não documentada como concluída.", date: null },
    meeting: { title: "Reunião de alinhamento com a liderança (Sieg, CEO da SKA)", date: null, participants: "a confirmar", status: "a_confirmar", notes: "" },
    milestones: [
      { id: "ms-validacao", title: "Validação interna prevista", date: "2026-10-09", status: "previsto", sourceId: SRC_REUNIAO },
      { id: "ms-estimativa", title: "Primeira estimativa orçamentária", date: "2026-10-23", status: "previsto", sourceId: SRC_REUNIAO },
      { id: "ms-revisao", title: "Revisão técnica prevista", date: "2026-10-26", dateEnd: "2026-10-27", status: "previsto", sourceId: SRC_REUNIAO },
      { id: "ms-prefeitura", title: "Comunicação do valor estimado à prefeitura", date: "2026-10-30", status: "previsto", sourceId: SRC_REUNIAO },
    ],
    tasks: [],
    ideas: seedIdeas(),
    pillarNotes: {},
    scenarioId: SCENARIO_B,
  }
}

const SCEN_B: Scenario = {
  id: SCENARIO_B,
  name: "Cenário B — Estruturação do Projeto 3",
  kind: "alternative",
  description: "Novo planejamento, orçamento e formalização do Projeto 3. Recebe as propostas validadas internamente como registros planejados. Não representa aprovação.",
  overrides: {},
  added: [],
  removed: [],
}

const OLD_ALT_NAME = "Alternativo — prorrogação simulada + P3 em 2028"
const COLORS: Record<string, [string, string]> = { p1: ["#23845D", "#19885D"], p2: ["#087CB8", "#127BAF"], p3: ["#173B63", "#8870B5"] }
const OLD_REUNIAO = "Reunião de 02/10/2026 — Técnico 2 (ata não anexada)"

export function applyV11(d: StudioDoc): StudioDoc {
  const projects = d.projects.map((p) => (COLORS[p.id] && p.color === COLORS[p.id][0] ? { ...p, color: COLORS[p.id][1] } : p))
  const items = d.items.map((it) => {
    let next = it
    if (!it.modality && it.kind !== "projeto" && it.kind !== "vigencia" && it.kind !== "planejamento" && it.kind !== "marco") next = { ...next, modality: modalityOf(it) }
    if (it.consolidation === "ingles" && !it.shortName) next = { ...next, shortName: "Bolsas de Inglês" }
    return next
  })
  const scenarios = d.scenarios.map((s) => (s.id === "alt-prorrogacao" && s.name === OLD_ALT_NAME ? { ...s, name: "Cenário A — Prorrogação do Projeto 2 (simulação)" } : s))
  if (!scenarios.some((s) => s.id === SCENARIO_B)) scenarios.push(SCEN_B)
  const sources = d.sources.map((s) =>
    s.id === SRC_REUNIAO && s.title === OLD_REUNIAO
      ? { ...s, title: "Reunião / ata de 02/10/2026 (ata não anexada)", note: "Técnico 2: negociação concluída com o Senai, previsão de pagamento único e NF única. Projeto 3: encaminhamento favorável à estruturação, diante da insuficiência de recursos para despesas adicionais mesmo com prorrogação. Marcos: 09/10, 23/10, 26–27/10 e 30/10." }
      : s,
  )
  if (!sources.some((s) => s.id === SRC_V11)) sources.push({ id: SRC_V11, title: "Briefing V11 — propostas do Projeto 3 (pilares)", kind: "informado", status: "a_validar", note: "Lista de ideias para avaliação; nenhuma aprovada ou com elegibilidade presumida." })
  const decisions: Decision[] = d.decisions.some((x) => x.id === "d-validacao")
    ? d.decisions
    : [...d.decisions, { id: "d-validacao", title: "Validação interna da estruturação do Projeto 3 pela liderança", topic: "projeto3", status: "pendente", relatedItemIds: ["p3-ciclo"], description: "Etapa própria, prevista para 09/10/2026 segundo a ata. Permanece pendente até ser documentada." }]
  return { ...d, projects, items, scenarios, sources, decisions, strategy: d.strategy ?? seedStrategy(), settings: { ...d.settings, modelVersion: 11 } }
}
