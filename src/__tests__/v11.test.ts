import { describe, expect, it } from "vitest"
import { toDay } from "@/lib/dates"
import { applyScenario } from "@/lib/analysis"
import { computeModalities, packPreferred, type ModOptions } from "@/lib/modalities"
import type { Row } from "@/lib/layout"
import { createSeed } from "@/data/seed"
import { needsMigration, normalizeDoc } from "@/data/migrate"
import { SCENARIO_B } from "@/data/v11"
import type { StudioDoc } from "@/data/types"
import { writeVisual } from "@/store/store"
import { addIdeaToScenario, moveIdea, patchIdea, patchMilestone, patchStrategy } from "@/store/strategy"
import { newFin } from "@/store/finance"
import { summarize } from "@/studio/FinanceColumn"

const REF = toDay("2026-10-08")
type Lane = Extract<Row, { type: "lane" }>

function mod(doc: StudioDoc, o: Partial<ModOptions> = {}, scenario = "baseline") {
  const items = applyScenario(doc, scenario)
  return computeModalities({ doc, items, fins: doc.finRecords ?? [], ref: REF, expanded: [], collapsedModalities: [], hiddenProjects: [], hideSettled: [], finFilter: "all", consolidations: doc.consolidations, detailAll: false, ...o })
}
const lanes = (rows: Row[]) => rows.filter((r): r is Lane => r.type === "lane")
const modality = (rows: Row[], id: string) => lanes(rows).find((r) => r.modality === id)

describe("V11 — timeline por projetos e modalidades", () => {
  it("região de projetos: P1, P2 (planejamento e vigência separados) e P3", () => {
    const L = mod(createSeed())
    const proj = lanes(L.rows).filter((r) => r.kind !== "modality")
    expect(proj.map((r) => `${r.kind}:${r.projectId}`)).toEqual(["project:p1", "project:p2", "plan:p2", "vig:p2", "project:p3"])
    const vig = proj.find((r) => r.kind === "vig")!
    expect(vig.members.map((m) => m.item.id).sort()).toEqual(["p2-marco-0531", "p2-vigencia"])
  })

  it("cinco modalidades com poucas linhas; Técnico Piloto, Técnico 1 e Técnico 2 lado a lado", () => {
    const L = mod(createSeed())
    expect(lanes(L.rows).filter((r) => r.kind === "modality").map((r) => r.modality)).toEqual(["jornada", "robotica", "tecnico", "bolsas", "operacao", "outras"])
    const tec = modality(L.rows, "tecnico")!
    const lane = Object.fromEntries(tec.members.map((m) => [m.item.id, m.lane]))
    expect(Object.keys(lane).sort()).toEqual(["p1-tecnico", "t1", "t2"])
    expect(lane.t1).not.toBe(lane.t2) // overlap → separate lanes
    expect(tec.laneCount).toBe(2)
    const bol = modality(L.rows, "bolsas")!
    expect(bol.members.map((m) => m.item.id).sort()).toEqual(["ing-1", "ing-2", "ing-3", "t1-bolsas", "t2-bolsas"])
  })

  it("componentes do curso só aparecem quando ele é expandido", () => {
    const doc = createSeed()
    expect(mod(doc).rows.some((r) => r.type === "comp")).toBe(false)
    const L = mod(doc, { expanded: ["t1"] })
    const comps = L.rows.filter((r): r is Extract<Row, { type: "comp" }> => r.type === "comp")
    expect(comps.map((c) => c.comp)).toEqual(["aquisicao", "nf", "materiais"])
    expect(comps[0].prefix).toBe("Técnico 1")
  })

  it("ocultar P1 esconde a faixa e as ações exclusivas, sem excluir", () => {
    const doc = createSeed()
    const L = mod(doc, { hiddenProjects: ["p1"] })
    const ids = lanes(L.rows).flatMap((r) => r.members.map((m) => m.item.id))
    expect(ids.some((x) => x.startsWith("p1-"))).toBe(false)
    expect(ids).toContain("t1")
    expect(doc.items.filter((i) => i.projectId === "p1").length).toBeGreaterThan(0)
  })

  it("o período do Projeto 3 vem do cenário selecionado", () => {
    const doc = createSeed()
    const p3 = (sc: string) => lanes(mod(doc, {}, sc).rows).find((r) => r.kind === "project" && r.projectId === "p3")!.members[0].item
    expect(p3("baseline").start).toBe("2027-07-01")
    expect(p3("alt-prorrogacao").start).toBe("2028-01-01")
  })

  it("arraste vertical muda modalidade/linha, nunca as datas; o design não altera dados", () => {
    const doc = createSeed()
    const before = doc.items.find((i) => i.id === "p1-educ")!
    const moved = writeVisual(doc, "baseline", "p1-educ", { modality: "jornada", modLane: 1 })
    const after = moved.items.find((i) => i.id === "p1-educ")!
    expect([after.start, after.end, after.certainty]).toEqual([before.start, before.end, before.certainty])
    expect(modality(mod(moved).rows, "jornada")!.members.map((m) => m.item.id)).toContain("p1-educ")
    const styled = writeVisual(doc, "baseline", "t1", { style: { fill: "#ff0000", radius: 10, font: "serif" } })
    const eff = applyScenario(styled, "working").find((i) => i.id === "t1")!
    expect(eff.changed).toBe(false)
    expect([eff.start, eff.end, eff.finance]).toEqual([doc.items.find((i) => i.id === "t1")!.start, doc.items.find((i) => i.id === "t1")!.end, doc.items.find((i) => i.id === "t1")!.finance])
    expect(styled.finRecords).toBe(doc.finRecords)
  })

  it("empacotamento respeita a linha preferida quando está livre", () => {
    expect(packPreferred([{ start: 0, end: 10 }, { start: 20, end: 30, pref: 1 }, { start: 5, end: 25 }]).lanes).toEqual([0, 1, 2])
    expect(packPreferred([{ start: 0, end: 10 }, { start: 5, end: 8, pref: 0 }]).lanes).toEqual([0, 1])
  })
})

describe("V11 — resumo financeiro", () => {
  it("soma por registro, saldo só com contratado e pago informados", () => {
    let doc = createSeed()
    doc = { ...doc, finRecords: doc.finRecords!.map((f) => (f.id === "fin-t1-aquisicao" ? { ...f, contractValue: 5000 } : f)) }
    doc = newFin(doc, "pagamento", doc.items.find((i) => i.id === "t1")!, { parentId: "fin-t1-aquisicao", realized: true, value: 2000, start: "2026-03-01", end: "2026-03-01" }).doc
    const s = summarize([...doc.finRecords!], new Set(["t1", "t2"]))
    expect(s).toMatchObject({ acqs: 2, contracted: 5000, paid: 2000, balance: 3000, missing: 1 })
    const none = summarize(createSeed().finRecords!, new Set(["t1"]))
    expect([none.contracted, none.paid, none.balance]).toEqual([null, null, null])
  })
})

describe("V11 — Projeto 3", () => {
  it("ideias mudam de pilar e de posição; edição inválida é recusada", () => {
    const doc = createSeed()
    const m = moveIdea(doc, "idea-automacao", "formacao", 0)
    const col = m.strategy!.ideas.filter((i) => i.pillar === "formacao").sort((a, b) => a.order - b.order)
    expect(col[0].id).toBe("idea-automacao")
    expect(col.map((i) => i.order)).toEqual(col.map((_, k) => k))
    expect(patchIdea(doc, "idea-automacao", { name: "  " })).toBe(doc)
    expect(patchIdea(doc, "idea-automacao", { start: "2028-05-01", end: "2028-01-01" })).toBe(doc)
    expect(patchStrategy(doc, { premiseYears: 0 })).toBe(doc)
  })

  it("só uma ideia validada vai ao cenário, como registro planejado — nunca à base", () => {
    let doc = createSeed()
    expect(addIdeaToScenario(doc, "idea-formacao-em-ia").itemId).toBeNull()
    doc = patchIdea(doc, "idea-formacao-em-ia", { status: "validada" })
    const r = addIdeaToScenario(doc, "idea-formacao-em-ia")
    expect(r.itemId).toBeTruthy()
    expect(r.doc.items).toBe(doc.items)
    const added = r.doc.scenarios.find((s) => s.id === SCENARIO_B)!.added.find((i) => i.id === r.itemId)!
    expect(added).toMatchObject({ projectId: "p3", certainty: "planejado", dateUndetermined: true, start: "2027-07-01", end: "2030-06-30", ideaId: "idea-formacao-em-ia" })
    expect(applyScenario(r.doc, "baseline").some((i) => i.id === r.itemId)).toBe(false)
    expect(applyScenario(r.doc, SCENARIO_B).some((i) => i.id === r.itemId)).toBe(true)
    expect(addIdeaToScenario(r.doc, "idea-formacao-em-ia").doc).toBe(r.doc)
  })

  it("marcos da ata começam previstos e só mudam por atualização explícita", () => {
    const doc = createSeed()
    const ms = doc.strategy!.milestones
    expect(ms.map((m) => `${m.date}:${m.status}`)).toEqual(["2026-10-09:previsto", "2026-10-23:previsto", "2026-10-26:previsto", "2026-10-30:previsto"])
    expect(ms[2].dateEnd).toBe("2026-10-27")
    const later = normalizeDoc({ ...doc, settings: { ...doc.settings, referenceDate: "2026-12-01" } })
    expect(later.strategy!.milestones.every((m) => m.status === "previsto")).toBe(true)
    const done = patchMilestone(doc, "ms-validacao", { status: "realizado" })
    expect(done.strategy!.milestones[0].status).toBe("realizado")
    expect(doc.strategy!.leadershipValidation.status).toBe("pendente")
    expect(doc.strategy!.meeting).toMatchObject({ date: null, participants: "a confirmar", status: "a_confirmar" })
  })
})

describe("V11 — migração", () => {
  it("migra um documento V8 preservando IDs e registros, uma única vez", () => {
    const seed = createSeed()
    const v8: StudioDoc = {
      ...seed,
      strategy: undefined,
      settings: { ...seed.settings, modelVersion: 8 },
      projects: seed.projects.map((p) => ({ ...p, color: { p1: "#23845D", p2: "#087CB8", p3: "#173B63" }[p.id] ?? p.color })),
      scenarios: seed.scenarios.filter((s) => s.id !== SCENARIO_B),
      items: seed.items.map((i) => ({ ...i, modality: undefined })),
    }
    expect(needsMigration(v8)).toBe(true)
    const m = normalizeDoc(v8)
    expect(m.items.map((i) => i.id)).toEqual(v8.items.map((i) => i.id))
    expect(m.finRecords).toEqual(v8.finRecords)
    expect(m.projects.map((p) => p.color)).toEqual(["#19885D", "#127BAF", "#8870B5"])
    expect(m.scenarios.map((s) => s.id)).toContain(SCENARIO_B)
    expect(m.strategy!.ideas.length).toBe(26)
    expect(m.items.find((i) => i.id === "t1")!.modality).toBe("tecnico")
    expect(normalizeDoc(m)).toBe(m)
  })

  it("não sobrescreve uma cor escolhida pelo usuário", () => {
    const seed = createSeed()
    const custom: StudioDoc = { ...seed, settings: { ...seed.settings, modelVersion: 8 }, projects: seed.projects.map((p) => (p.id === "p1" ? { ...p, color: "#000000" } : p)) }
    expect(normalizeDoc(custom).projects[0].color).toBe("#000000")
  })
})
