import { describe, expect, it } from "vitest"
import { toDay } from "@/lib/dates"
import { applyScenario } from "@/lib/analysis"
import { computeHierarchy, type HierOptions } from "@/lib/hierarchy"
import { actionInfo, finTotals, isSettled, matchesFinFilter } from "@/lib/finance"
import type { Row } from "@/lib/layout"
import { createSeed } from "@/data/seed"
import { normalizeDoc, needsMigration } from "@/data/migrate"
import type { FinRecord, StudioDoc } from "@/data/types"
import { newFin, patchFin, setAcqStep, setFunding } from "@/store/finance"
import { writePatch } from "@/store/store"

const REF = toDay("2026-10-08")

function layout(doc: StudioDoc, o: Partial<HierOptions> = {}) {
  const items = applyScenario(doc, "baseline")
  return computeHierarchy({
    doc, items, fins: doc.finRecords ?? [], ref: REF, level: 2, expanded: [], collapsed: [], collapsedProjects: [],
    hiddenProjects: [], hideSettled: [], finFilter: "all", consolidations: doc.consolidations, ...o,
  })
}
const itemIds = (rows: Row[]) => rows.filter((r): r is Extract<Row, { type: "item" }> => r.type === "item" && !r.virtual).map((r) => r.item.id)
const rowsUnder = (rows: Row[], id: string) => {
  const i = rows.findIndex((r) => r.type === "item" && r.item.id === id && r.depth === 1)
  const out: Row[] = []
  for (const r of rows.slice(i + 1)) {
    if (!("depth" in r) || (r.depth ?? 0) < 2) break
    out.push(r)
  }
  return out
}

describe("V8 — hierarchy", () => {
  it("Teste 1: Técnico 1 recolhido ocupa uma única linha, com a situação da aquisição", () => {
    const L = layout(createSeed())
    const t1 = L.rows.filter((r) => r.type === "item" && r.item.id === "t1")
    expect(t1).toHaveLength(1)
    expect(rowsUnder(L.rows, "t1")).toHaveLength(0)
    const r = t1[0] as Extract<Row, { type: "item" }>
    expect(r.info?.tags.map((t) => t.label)).toContain("Pago")
    // The bolsa is a component of the course: it is not a separate top-level row.
    expect(itemIds(L.rows)).not.toContain("t1-bolsas")
  })

  it("Teste 2: Técnico 1 expandido mostra aquisição, bolsas, NF e materiais", () => {
    const L = layout(createSeed(), { expanded: ["t1"] })
    const sub = rowsUnder(L.rows, "t1")
    const kinds = sub.map((r) => (r.type === "comp" ? r.comp : r.type === "item" ? r.item.id : r.type))
    expect(kinds).toEqual(["aquisicao", "t1-bolsas", "nf", "materiais"])
    const nf = sub.find((r) => r.type === "comp" && r.comp === "nf") as Extract<Row, { type: "comp" }>
    expect(nf.fins).toHaveLength(0)
    expect(nf.empty).toMatch(/Nenhuma nota fiscal/)
  })

  it("Teste 3: Técnico 2 mostra negociação concluída e formalização pendente", () => {
    const doc = createSeed()
    const L = layout(doc, { expanded: ["t2"] })
    const t2 = L.rows.find((r) => r.type === "item" && r.item.id === "t2") as Extract<Row, { type: "item" }>
    expect(t2.info?.tags.map((t) => t.label)).toContain("Compra a formalizar")
    const acq = doc.finRecords!.find((f) => f.id === "fin-t2-aquisicao")!
    expect(acq.steps!.filter((s) => s.done).map((s) => s.id)).toEqual(["planejamento", "negociacao"])
    expect(acq.steps!.find((s) => s.id === "contrato")!.done).toBe(false)
    const forecasts = doc.finRecords!.filter((f) => f.actionId === "t2" && f.kind !== "aquisicao")
    expect(forecasts.every((f) => !f.realized && f.dateUndetermined)).toBe(true)
  })

  it("Teste 5/6: ocultar P1 esconde suas ações exclusivas sem excluir; reexibir devolve tudo", () => {
    const doc = createSeed()
    const all = itemIds(layout(doc).rows)
    const hidden = itemIds(layout(doc, { hiddenProjects: ["p1"] }).rows)
    expect(all).toContain("p1-tecnico")
    expect(hidden).not.toContain("p1-tecnico")
    expect(hidden).not.toContain("p1-ciclo")
    expect(hidden).toContain("p2-vigencia")
    expect(doc.items.some((i) => i.id === "p1-tecnico")).toBe(true)
    expect(itemIds(layout(doc).rows)).toEqual(all)
  })

  it("Teste 7: ação do P1 com componente financiado pelo P2 continua visível ao ocultar P1", () => {
    let doc = createSeed()
    const r = newFin(doc, "material", doc.items.find((i) => i.id === "p1-robotica")!, { fundingProjectId: "p2", start: "2025-08-01", end: "2025-08-01", realized: true })
    doc = newFin(r.doc, "material", doc.items.find((i) => i.id === "p1-robotica")!, { fundingProjectId: "p1", start: "2024-03-01", end: "2024-03-01" }).doc
    const L = layout(doc, { hiddenProjects: ["p1"], expanded: ["p1-robotica"] })
    const row = L.rows.find((x) => x.type === "item" && x.item.id === "p1-robotica") as Extract<Row, { type: "item" }>
    expect(row).toBeTruthy()
    expect(row.via).toMatch(/participação do P2/)
    const mats = rowsUnder(L.rows, "p1-robotica").find((x) => x.type === "comp" && x.comp === "materiais") as Extract<Row, { type: "comp" }>
    expect(mats.fins.map((f) => f.fundingProjectId)).toEqual(["p2"])
    // Explicit funding on the action works the same way.
    const d2 = setFunding(createSeed(), "p1-jornada", [{ projectId: "p2", share: "material de apoio" }])
    expect(itemIds(layout(d2, { hiddenProjects: ["p1"] }).rows)).toContain("p1-jornada")
  })

  it("Teste 9: Bolsas de Inglês em uma linha consolidada, registros de origem preservados", () => {
    const doc = createSeed()
    const L = layout(doc, { expanded: ["cons:ingles"] })
    const cons = L.rows.filter((r) => r.type === "consolidated")
    expect(cons).toHaveLength(1)
    expect((cons[0] as Extract<Row, { type: "consolidated" }>).members.map((m) => m.id)).toEqual(["ing-1", "ing-2", "ing-3"])
    expect(doc.items.filter((i) => i.consolidation === "ingles").every((i) => i.partner)).toBe(true)
  })

  it("nível 3 expande todas as ações; uma ação pode ser recolhida individualmente", () => {
    const L = layout(createSeed(), { level: 3, collapsed: ["t2"] })
    expect(rowsUnder(L.rows, "t1").length).toBeGreaterThan(0)
    expect(rowsUnder(L.rows, "t2")).toHaveLength(0)
    expect(itemIds(L.rows)).toContain("p2-plano")
  })
})

describe("V8 — finance", () => {
  it("Teste 4: alterar a situação da aquisição não altera as bolsas nem o curso", () => {
    const doc = createSeed()
    const next = patchFin(doc, "fin-t1-aquisicao", { acqStatus: "parcialmente_pago" })
    expect(next.finRecords!.find((f) => f.id === "fin-t1-aquisicao")!.acqStatus).toBe("parcialmente_pago")
    expect(next.items).toBe(doc.items)
    expect(next.items.find((i) => i.id === "t1-bolsas")).toEqual(doc.items.find((i) => i.id === "t1-bolsas"))
  })

  it("Teste 10: mover o curso não altera pagamentos nem documentos", () => {
    const doc = createSeed()
    const moved = writePatch(doc, "baseline", "t1", { start: "2026-04-01", end: "2028-02-29" })
    expect(moved.finRecords).toBe(doc.finRecords)
    expect(moved.items.find((i) => i.id === "t1")!.start).toBe("2026-04-01")
  })

  it("etapas são independentes e uma edição inválida é recusada por inteiro", () => {
    const doc = createSeed()
    const a = setAcqStep(doc, "fin-t2-aquisicao", "nf", { done: true })
    const steps = a.finRecords!.find((f) => f.id === "fin-t2-aquisicao")!.steps!
    expect(steps.filter((s) => s.done).map((s) => s.id)).toEqual(["planejamento", "negociacao", "nf"])
    expect(patchFin(doc, "fin-t2-pagamento", { start: "2027-05-01", end: "2027-01-01" })).toBe(doc)
    expect(setAcqStep(doc, "fin-t2-aquisicao", "contrato", { done: true, date: "2027-02-30" })).toBe(doc)
  })

  it("Teste 13: uma despesa vista em várias visões é contada uma vez", () => {
    let doc = createSeed()
    const t1 = doc.items.find((i) => i.id === "t1")!
    const r = newFin(doc, "pagamento", t1, { parentId: "fin-t1-aquisicao", start: "2026-03-10", end: "2026-03-10", realized: true, value: 1000, fundingProjectId: "p2" })
    doc = r.doc
    const pay = doc.finRecords!.find((f) => f.id === r.id)!
    // The same record reaches the totals through the action, the project and a filter.
    const views = [...doc.finRecords!, pay, pay]
    const before = finTotals(createSeed().finRecords!).paid ?? 0
    expect(finTotals(views).paid).toBe(before + 1000)
    expect(finTotals(views, { projects: ["p2"] }).paid).toBe(before + 1000)
    expect(finTotals(views, { projects: ["p1"] }).paid).toBeNull()
    expect(doc.finRecords!.filter((f) => f.id === r.id)).toHaveLength(1)
  })

  it("'Pago' só com registro de aquisição; sem registro, 'Pagamento a validar'", () => {
    const doc = createSeed()
    const items = applyScenario(doc, "baseline")
    const fins = doc.finRecords!
    const p1 = actionInfo(items.find((i) => i.id === "p1-educ")!, items, fins, REF)
    expect(p1.tags[0].label).toBe("Pagamento a validar")
    expect(p1.paid).toBe(false)
    // P1 acquisitions informed as paid in V18 carry their own record.
    expect(actionInfo(items.find((i) => i.id === "p1-tecnico")!, items, fins, REF).paid).toBe(true)
    const t1 = actionInfo(items.find((i) => i.id === "t1")!, items, fins, REF)
    expect(t1.paid).toBe(true)
    // Paid acquisition, but bolsas and proof are still open.
    expect(t1.open).toEqual(expect.arrayContaining(["comprovação pendente", "bolsas em período futuro"]))
  })

  it("ocultar concluídas e pagas preserva ações com compromissos abertos", () => {
    let doc = createSeed()
    // A finished, paid and proven P1 action — and another finished and paid with an open NF.
    doc = writePatch(doc, "baseline", "p1-robotica", { dateUndetermined: false, certainty: "executado", start: "2024-02-01", end: "2024-11-30" })
    doc = writePatch(doc, "baseline", "p1-jornada", { dateUndetermined: false, certainty: "executado", start: "2024-02-01", end: "2024-11-30" })
    // Their V18 acquisitions (paid, proof pending) become proven.
    const prove = (d: StudioDoc, id: string, extra: Partial<FinRecord>) => patchFin(d, `fin-${id}-aquisicao`, { proof: "comprovado", evidence: "doc", ...extra })
    doc = prove(doc, "p1-robotica", {})
    doc = prove(doc, "p1-jornada", {})
    doc = newFin(doc, "nf", doc.items.find((i) => i.id === "p1-jornada")!, { start: "2025-01-10", end: "2025-01-10" }).doc
    const L = layout(doc, { hideSettled: ["p1"] })
    const ids = itemIds(L.rows)
    expect(ids).not.toContain("p1-robotica")
    expect(ids).toContain("p1-jornada")
    expect(L.stats.settledHidden.p1).toBe(1)
    // Kept with a warning: the action with the forecast NF and those whose proof is still pending (V18 records).
    const kept = L.stats.settledKeptOpen.p1
    expect(kept.filter((x) => x.includes("NF prevista"))).toHaveLength(1)
    // every other kept action is kept only for its pending proof — never silently hidden
    expect(kept.every((x) => x.includes("NF prevista") || /comprova/i.test(x))).toBe(true)
    expect(doc.items.some((i) => i.id === "p1-robotica")).toBe(true)
    const items = applyScenario(doc, "baseline")
    expect(isSettled(actionInfo(items.find((i) => i.id === "p1-robotica")!, items, doc.finRecords!, REF))).toBe(true)
  })

  it("filtro financeiro: paga / a adquirir / a validar", () => {
    const doc = createSeed()
    const items = applyScenario(doc, "baseline")
    const info = (id: string) => actionInfo(items.find((i) => i.id === id)!, items, doc.finRecords!, REF)
    expect(matchesFinFilter(info("t1"), "paid", REF)).toBe(true)
    expect(matchesFinFilter(info("t2"), "paid", REF)).toBe(false)
    expect(matchesFinFilter(info("t2"), "pending", REF)).toBe(true)
    expect(matchesFinFilter(info("t2"), "future", REF)).toBe(true)
    expect(matchesFinFilter(info("p1-tecnico"), "validate", REF)).toBe(true)
    const L = layout(doc, { finFilter: "paid" })
    expect(itemIds(L.rows)).toContain("t1")
    expect(itemIds(L.rows)).not.toContain("t2")
    expect(itemIds(L.rows)).toContain("p2-vigencia")
  })
})

describe("V8 — migration", () => {
  it("migra um documento V6 preservando IDs, sem duplicar e uma única vez", () => {
    const seed = createSeed()
    const v6: StudioDoc = {
      ...seed,
      finRecords: undefined,
      settings: { ...seed.settings, modelVersion: 6 },
      items: seed.items.map((i) => (i.id === "t1" ? { ...i, start: "2026-02-01", revisions: undefined } : i)),
    }
    expect(needsMigration(v6)).toBe(true)
    const m = normalizeDoc(v6)
    expect(m.items.map((i) => i.id)).toEqual(v6.items.map((i) => i.id))
    expect(m.finRecords!.map((f) => f.id)).toEqual(expect.arrayContaining(["fin-t1-aquisicao", "fin-t2-aquisicao", "fin-t2-nf", "fin-t2-pagamento"]))
    expect(new Set(m.finRecords!.map((f) => f.id)).size).toBe(m.finRecords!.length)
    const t1 = m.items.find((i) => i.id === "t1")!
    expect(t1.start).toBe("2026-02-18")
    expect(t1.revisions?.[0]).toMatchObject({ from: "2026-02-01", to: "2026-02-18" })
    expect(needsMigration(m)).toBe(false)
    expect(normalizeDoc(m)).toBe(m)
  })

  it("não reescreve um início já editado pelo usuário nem valores não informados", () => {
    const seed = createSeed()
    const edited: StudioDoc = { ...seed, finRecords: [], settings: { ...seed.settings, modelVersion: 6 }, items: seed.items.map((i) => (i.id === "t1" ? { ...i, start: "2026-03-01", revisions: undefined } : i)) }
    const m = normalizeDoc(edited)
    expect(m.items.find((i) => i.id === "t1")!.start).toBe("2026-03-01")
    // Only values the briefings inform are filled; nothing is marked proven.
    expect(m.finRecords!.filter((f) => !f.sourceIds.includes("src-briefing-v18")).every((f) => f.value === null)).toBe(true)
    expect(m.finRecords!.every((f) => f.proof === "pendente")).toBe(true)
  })
})
