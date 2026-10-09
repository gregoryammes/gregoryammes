import { isValidISO } from "@/lib/dates"
import { applyScenario } from "@/lib/analysis"
import { seedStrategy, SRC_V11 } from "@/data/v11"
import type { Idea, Item, ModalityId, PillarId, StrategyMilestone, StrategyTask, Strategy, StudioDoc } from "@/data/types"
import { uid } from "./store"

/** Pure, all-or-nothing operations on the Projeto 3 strategic board. Invalid edits return the doc unchanged. */

const strat = (d: StudioDoc): Strategy => d.strategy ?? seedStrategy()
const withStrat = (d: StudioDoc, s: Strategy): StudioDoc => ({ ...d, strategy: s })

const validPeriod = (a?: string | null, b?: string | null) => (!a || isValidISO(a)) && (!b || isValidISO(b)) && !(a && b && b < a)

export function patchStrategy(d: StudioDoc, patch: Partial<Strategy>): StudioDoc {
  const s = strat(d)
  if (patch.premiseYears != null && (!Number.isFinite(patch.premiseYears) || patch.premiseYears <= 0 || patch.premiseYears > 10)) return d
  return withStrat(d, { ...s, ...patch })
}

export function addIdea(d: StudioDoc, pillar: PillarId, name = "Nova proposta"): { doc: StudioDoc; id: string } {
  const s = strat(d)
  const id = uid("idea")
  const order = Math.max(-1, ...s.ideas.filter((i) => i.pillar === pillar).map((i) => i.order)) + 1
  const idea: Idea = { id, name, pillar, priority: null, status: "ideia", order, cost: null, start: null, end: null }
  return { doc: withStrat(d, { ...s, ideas: [...s.ideas, idea] }), id }
}

export function patchIdea(d: StudioDoc, id: string, patch: Partial<Idea>): StudioDoc {
  const s = strat(d)
  const cur = s.ideas.find((i) => i.id === id)
  if (!cur) return d
  const next = { ...cur, ...patch }
  if (!next.name.trim()) return d
  if (!validPeriod(next.start, next.end)) return d
  if (next.cost != null && (Number.isNaN(next.cost) || next.cost < 0)) return d
  return withStrat(d, { ...s, ideas: s.ideas.map((i) => (i.id === id ? next : i)) })
}

/** Moves an idea to a pillar at a position, renumbering the target column. */
export function moveIdea(d: StudioDoc, id: string, pillar: PillarId, index: number): StudioDoc {
  const s = strat(d)
  const cur = s.ideas.find((i) => i.id === id)
  if (!cur) return d
  const col = s.ideas.filter((i) => i.pillar === pillar && i.id !== id).sort((a, b) => a.order - b.order)
  col.splice(Math.max(0, Math.min(col.length, index)), 0, { ...cur, pillar })
  const order = new Map(col.map((i, k) => [i.id, k]))
  return withStrat(d, { ...s, ideas: s.ideas.map((i) => (i.id === id ? { ...i, pillar, order: order.get(id)! } : order.has(i.id) ? { ...i, order: order.get(i.id)! } : i)) })
}

export function deleteIdea(d: StudioDoc, id: string): StudioDoc {
  const s = strat(d)
  // The planned record created from it (if any) stays: it is a record of its own.
  return withStrat(d, { ...s, ideas: s.ideas.filter((i) => i.id !== id) })
}

const PILLAR_MODALITY: Record<PillarId, ModalityId> = { formacao: "outras", talentos: "outras", infraestrutura: "operacao", ia: "outras", transversal: "outras" }

function modalityFor(idea: Idea): ModalityId {
  const n = idea.name.toLowerCase()
  if (n.includes("jornada")) return "jornada"
  if (n.includes("robótica")) return "robotica"
  if (n.includes("técnic")) return "tecnico"
  return PILLAR_MODALITY[idea.pillar]
}

/**
 * "Adicionar ao cenário do Projeto 3": only for an idea validated internamente. Creates a planned
 * record that exists only in the Projeto 3 scenario — never an approved project. Without an
 * intended period it spans the scenario's P3 cycle, marked as "data a definir".
 */
export function addIdeaToScenario(d: StudioDoc, ideaId: string): { doc: StudioDoc; itemId: string | null; reason?: string } {
  const s = strat(d)
  const idea = s.ideas.find((i) => i.id === ideaId)
  if (!idea) return { doc: d, itemId: null, reason: "Proposta não encontrada." }
  if (idea.status !== "validada") return { doc: d, itemId: null, reason: "Somente propostas validadas internamente podem ir para o cenário." }
  const sc = d.scenarios.find((x) => x.id === s.scenarioId)
  if (!sc) return { doc: d, itemId: null, reason: "Cenário do Projeto 3 não encontrado." }
  if (idea.linkedItemId && sc.added.some((i) => i.id === idea.linkedItemId)) return { doc: d, itemId: idea.linkedItemId, reason: "Esta proposta já está no cenário." }
  const p3 = applyScenario(d, sc.id).find((i) => i.kind === "projeto" && i.projectId === "p3")
  const own = !!(idea.start && idea.end)
  const start = own ? idea.start! : (p3?.start ?? null)
  const end = own ? idea.end! : (p3?.end ?? null)
  if (!start || !end) return { doc: d, itemId: null, reason: "Defina o período pretendido da proposta." }
  const modality = modalityFor(idea)
  const id = uid("p3")
  const item: Item = {
    id,
    name: idea.name,
    shortName: idea.name.length > 28 ? idea.name.slice(0, 27) + "…" : idea.name,
    kind: modality === "operacao" ? "operacao" : "atividade",
    layer: modality === "operacao" ? "operacao" : "formacao",
    lane: 0,
    projectId: "p3",
    start,
    end,
    precision: "month",
    dateUndetermined: !own,
    certainty: "planejado",
    sourceIds: [SRC_V11],
    modality,
    ideaId: idea.id,
    description: idea.description,
    notes: `Registro planejado a partir da proposta “${idea.name}” (${own ? "período pretendido" : "período a definir dentro do Projeto 3"}). Não representa projeto aprovado nem elegibilidade.`,
  }
  const next: StudioDoc = {
    ...d,
    scenarios: d.scenarios.map((x) => (x.id === sc.id ? { ...x, added: [...x.added, item] } : x)),
    strategy: { ...s, ideas: s.ideas.map((i) => (i.id === idea.id ? { ...i, linkedItemId: id } : i)) },
  }
  return { doc: next, itemId: id }
}

export function patchMilestone(d: StudioDoc, id: string, patch: Partial<StrategyMilestone>): StudioDoc {
  const s = strat(d)
  const cur = s.milestones.find((m) => m.id === id)
  if (!cur) return d
  const next = { ...cur, ...patch }
  if (!validPeriod(next.date, next.dateEnd)) return d
  return withStrat(d, { ...s, milestones: s.milestones.map((m) => (m.id === id ? next : m)) })
}

export function addMilestone(d: StudioDoc, title = "Novo marco"): StudioDoc {
  const s = strat(d)
  return withStrat(d, { ...s, milestones: [...s.milestones, { id: uid("ms"), title, date: null, status: "a_confirmar" }] })
}

export function addTask(d: StudioDoc, kind: StrategyTask["kind"], text: string): StudioDoc {
  if (!text.trim()) return d
  const s = strat(d)
  return withStrat(d, { ...s, tasks: [...s.tasks, { id: uid("task"), kind, text: text.trim(), done: false, due: null }] })
}

export function patchTask(d: StudioDoc, id: string, patch: Partial<StrategyTask>): StudioDoc {
  const s = strat(d)
  if (patch.due && !isValidISO(patch.due)) return d
  return withStrat(d, { ...s, tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)) })
}

export function deleteTask(d: StudioDoc, id: string): StudioDoc {
  const s = strat(d)
  return withStrat(d, { ...s, tasks: s.tasks.filter((t) => t.id !== id) })
}
