import type { Item, StudioDoc, Turma } from "./types"

/**
 * V6 additions — idempotent. Used by the seed and by the migration of saved documents.
 * Never overwrites a field the user already filled; never deletes records.
 */
export const SRC_QUADRO = "src-quadro-referencia"

const QUADRO_NOTE =
  "Registro a partir do quadro “Tempo Vigência x Projeto” enviado pelo usuário. Datas marcadas como aproximadas foram lidas da posição das barras: validar com a documentação."

const ENGLISH: Item[] = [
  {
    id: "ing-1", name: "Bolsas de Inglês — período 1", kind: "bolsa", layer: "bolsas", lane: 2, projectId: "p2",
    start: "2025-10-01", end: "2026-09-30", precision: "month", certainty: "a_validar", sourceIds: [SRC_QUADRO],
    consolidation: "ingles", partner: "KNN", students: 3, finSituation: "pendente",
    description: "3 alunos · finaliza set/2026 (informado no quadro).",
    notes: `${QUADRO_NOTE} Início (out/2025) aproximado. Vínculo ao Projeto 2 a validar.`,
  },
  {
    id: "ing-2", name: "Bolsas de Inglês — período 2", kind: "bolsa", layer: "bolsas", lane: 2, projectId: "p2",
    start: "2026-05-01", end: "2027-04-30", precision: "month", certainty: "a_validar", sourceIds: [SRC_QUADRO],
    consolidation: "ingles", partner: "Wizard", students: 3, finSituation: "pendente",
    description: "3 alunos · iniciou mai/2026 (informado no quadro).",
    notes: `${QUADRO_NOTE} Término (abr/2027) aproximado. Vínculo ao Projeto 2 a validar.`,
  },
  {
    id: "ing-3", name: "Bolsas de Inglês — concessão da turma 2027", kind: "bolsa", layer: "bolsas", lane: 2, projectId: "p2",
    start: "2027-05-01", end: "2028-04-30", precision: "month", certainty: "planejado", sourceIds: [SRC_QUADRO],
    consolidation: "ingles", partner: "Wizard", students: null, finSituation: "compromisso_previsto",
    description: "Concessão prevista para a turma 2027 (informado no quadro).",
    notes: `${QUADRO_NOTE} Período inteiro aproximado. Não representa contratação.`,
  },
]

const TURMAS: Turma[] = [
  {
    id: "turma-tec-2026", name: "Turma Técnico 2026–2027", entryYear: 2026, start: "2026-02-01", end: "2027-12-31",
    courseId: "curso-tecnico", offeringId: "t1", projectId: "p2", students: 27, studentsCertainty: "a_validar",
    stage: "tecnico", status: "a_validar", sourceIds: [SRC_QUADRO],
    notes: "Quadro de referência: “18/02/2026 · 27 alunos · turma 2026-2027”. Início em 18/02/2026 a conciliar com o período da oferta (fev/2026).",
    generationId: null,
  },
  {
    id: "turma-tec-2027", name: "Turma prevista 2027–2028", entryYear: 2027, start: "2027-02-01", end: "2028-12-31",
    courseId: "curso-tecnico", offeringId: "t2", projectId: "p2", students: null, studentsCertainty: "nao_informado",
    stage: "tecnico", status: "hipotese", sourceIds: [],
    notes: "Turma de cenário: não formada nem contratada.",
    generationId: null,
  },
]

const ITEM_PATCH: Record<string, Partial<Item>> = {
  t1: { shortName: "Técnico 1", courseId: "curso-tecnico", turmaIds: ["turma-tec-2026"], finSituation: "pendente" },
  t2: { shortName: "Técnico 2", courseId: "curso-tecnico", turmaIds: ["turma-tec-2027"], finSituation: "pendente" },
  "t1-bolsas": { shortName: "Bolsas Técnico 1", turmaIds: ["turma-tec-2026"], finSituation: "pagamentos_condicionados" },
  "t2-bolsas": { shortName: "Bolsas Técnico 2", turmaIds: ["turma-tec-2027"], finSituation: "pagamentos_condicionados" },
  "p2-equipe": { finSituation: "pendente" },
}

export function applyV6(d: StudioDoc): StudioDoc {
  const ids = new Set(d.items.map((i) => i.id))
  let items = d.items.map((it) => {
    const p = ITEM_PATCH[it.id]
    let next = it
    if (p) {
      next = { ...it }
      for (const [k, v] of Object.entries(p)) if ((next as unknown as Record<string, unknown>)[k] === undefined) (next as unknown as Record<string, unknown>)[k] = v
    }
    // V6 reference: operational vigência jul/2025–jun/2027. The 31/05/2025 start was only a visual
    // placeholder; it is revised once, with history, and only if the user never edited it.
    if (it.id === "p2-vigencia" && it.start === "2025-05-31" && !(it.revisions ?? []).length) {
      next = {
        ...next,
        start: "2025-07-01",
        revisions: [{ at: "2026-10-09", field: "start", from: "2025-05-31", to: "2025-07-01", note: "Início ajustado ao período operacional de referência informado na V6 (jul/2025–jun/2027). O marco de 31/05/2025 continua em registro próprio, com natureza a conciliar." }],
        notes: "Período operacional de referência jul/2025–jun/2027. Encerramento de referência 30/06/2027, sujeito à validação do instrumento e de aditivos. Prorrogações só em cenário.",
      }
    }
    return next
  })
  items = [...items, ...ENGLISH.filter((e) => !ids.has(e.id))]
  const sources = d.sources.some((s) => s.id === SRC_QUADRO)
    ? d.sources
    : [...d.sources, { id: SRC_QUADRO, title: "Quadro “Tempo Vigência x Projeto” (imagem enviada pelo usuário)", kind: "informado" as const, status: "a_validar" as const, note: "Valores e datas a conciliar com os documentos de origem." }]
  const turmas = [...(d.turmas ?? [])]
  for (const t of TURMAS) if (!turmas.some((x) => x.id === t.id) && ids.has(t.offeringId ?? "")) turmas.push(t)
  return {
    ...d,
    items,
    sources,
    courses: d.courses ?? [{ id: "curso-tecnico", name: "Curso Técnico (nome oficial a confirmar)", notes: "Catálogo: o curso. Técnico 1 e Técnico 2 são ofertas (edições) dele." }],
    turmas,
    generations: d.generations ?? [],
    consolidations: d.consolidations ?? [{ id: "ingles", name: "Bolsas de Inglês", subtitle: "Programa de Formação Complementar" }],
    settings: { ...d.settings, modelVersion: 6 },
  }
}
