import { describe, expect, it } from "vitest"
import { toDay } from "@/lib/dates"
import { applyScenario } from "@/lib/analysis"
import { financeStamp, finRecordsIn, acqOf } from "@/lib/finance"
import { quadrantRange, quadrantRows, ruleRange, rowKey } from "@/lib/quadrants"
import { computeModalities } from "@/lib/modalities"
import { createSeed, createSeedV11 } from "@/data/seed"
import { applyV18, SEED_QUADRANTS, SRC_V18 } from "@/data/v18"
import { needsMigration, normalizeDoc } from "@/data/migrate"
import { newFin, setFunding } from "@/store/finance"
import { deleteTurma, newTurmaFor, scenarioSetsTurmas, setItemTurmas } from "@/store/turmas"
import { turmasOf } from "@/lib/v6"
import { summarize } from "@/studio/FinanceColumn"
import type { StudioDoc } from "@/data/types"
import { deleteQuadrant, duplicateQuadrant, newQuadrant, patchQuadrant, shiftLayer, validQuadrant } from "@/store/quadrants"
import { writeVisual } from "@/store/store"

const REF = toDay("2026-10-08")
const iso = (d: number) => new Date(d * 864e5).toISOString().slice(0, 10)
const short = (doc: StudioDoc) => (id: string | null | undefined) => doc.projects.find((p) => p.id === id)?.short ?? null

describe("V18 — quadrantes", () => {
  it("“Após a vigência do Projeto 2” vem dos registros do cenário ativo (jul–dez/2027)", () => {
    const doc = createSeed()
    const r = ruleRange({ kind: "after_vigencia", projectId: "p2" }, applyScenario(doc, "baseline"))!
    expect([iso(r.start), iso(r.end - 1)]).toEqual(["2027-07-01", "2027-12-31"])
    // Moving the course end moves the quadrant; the quadrant itself stores nothing about it.
    const longer = { ...doc, items: doc.items.map((i) => (i.id === "t1" ? { ...i, end: "2028-03-31" } : i)) }
    expect(iso(ruleRange({ kind: "after_vigencia", projectId: "p2" }, applyScenario(longer, "baseline"))!.end - 1)).toBe("2028-03-31")
    // With the vigência extended past the course, nothing is left after it.
    expect(ruleRange({ kind: "after_vigencia", projectId: "p2" }, applyScenario(doc, "alt-prorrogacao"))).toBeNull()
  })

  it("“Projeto 3 — Proposta” segue o período do cenário selecionado", () => {
    const doc = createSeed()
    const q = doc.quadrants!.find((x) => x.id === "q-projeto3")!
    expect(iso(quadrantRange(q, applyScenario(doc, "baseline"))!.start)).toBe("2027-07-01")
    expect(iso(quadrantRange(q, applyScenario(doc, "alt-prorrogacao"))!.start)).toBe("2028-01-01")
  })

  it("criar, editar, duplicar, reordenar e excluir mexem só na camada visual", () => {
    const doc = createSeed()
    const { doc: d1, id } = newQuadrant(doc, { start: "2024-01-01", end: "2025-12-31", rowFrom: "lane:modality:robotica", rowTo: "lane:modality:tecnico" })
    expect(id).toBeTruthy()
    expect(d1.items).toBe(doc.items)
    expect(d1.finRecords).toBe(doc.finRecords)
    expect(d1.scenarios).toBe(doc.scenarios)
    const q = d1.quadrants!.find((x) => x.id === id)!
    expect(q).toMatchObject({ title: "Novo quadrante", mode: "manual", stroke: "solid", layer: 2 })
    // invalid edits are refused (all or nothing)
    expect(patchQuadrant(d1, id, { end: "2023-01-01" })).toBe(d1)
    expect(patchQuadrant(d1, id, { color: "laranja" })).toBe(d1)
    expect(patchQuadrant(d1, id, { title: "  " })).toBe(d1)
    const d2 = patchQuadrant(d1, id, { color: "#8870B5", start: "2024-03-01", stroke: "dashed", opacity: 0.2 })
    expect(d2.quadrants!.find((x) => x.id === id)).toMatchObject({ color: "#8870B5", start: "2024-03-01", stroke: "dashed", opacity: 0.2 })
    const dup = duplicateQuadrant(d2, id)
    expect(dup.doc.quadrants!.find((x) => x.id === dup.id)).toMatchObject({ title: "Novo quadrante (cópia)", layer: 3, locked: false })
    const back = shiftLayer(dup.doc, dup.id, -1)
    expect(back.quadrants!.find((x) => x.id === dup.id)!.layer).toBeLessThan(back.quadrants!.find((x) => x.id === id)!.layer)
    const del = deleteQuadrant(back, id)
    expect(del.quadrants!.some((x) => x.id === id)).toBe(false)
    expect(del.items).toBe(doc.items)
    expect(del.finRecords).toBe(doc.finRecords)
    expect(validQuadrant({ ...q, mode: "auto", rule: undefined })).toMatch(/regra/)
    // no-op edits return the same document (no undo entry); a locked quadrant keeps its place
    expect(patchQuadrant(d2, id, { color: "#8870B5" })).toBe(d2)
    // the current swatch again: the outline is compared as drawn (strokeColor ?? color)
    const seeded = doc.quadrants!.find((x) => x.id === "q-apos-vigencia-p2")!
    expect(seeded.strokeColor).toBeUndefined()
    expect(patchQuadrant(doc, seeded.id, { color: seeded.color, strokeColor: seeded.color })).toBe(doc)
    expect(deleteQuadrant(d2, "nao-existe")).toBe(d2)
    const locked = patchQuadrant(d2, id, { locked: true })
    expect(patchQuadrant(locked, id, { start: "2024-06-01" })).toBe(locked)
    expect(patchQuadrant(locked, id, { mode: "auto", rule: { kind: "project_period", projectId: "p3" } })).toBe(locked)
    expect(patchQuadrant(locked, id, { color: "#19885D" }).quadrants!.find((x) => x.id === id)!.color).toBe("#19885D")
    expect(patchQuadrant(locked, id, { locked: false, start: "2024-06-01" }).quadrants!.find((x) => x.id === id)!.start).toBe("2024-06-01")
  })

  it("as linhas do quadrante são ancoradas pela chave da linha, não pela posição", () => {
    const doc = createSeed()
    const items = applyScenario(doc, "baseline")
    const L = computeModalities({ doc, items, fins: doc.finRecords ?? [], ref: REF, expanded: [], collapsedModalities: ["bolsas", "operacao", "outras"], hiddenProjects: [], hideSettled: [], finFilter: "all", consolidations: doc.consolidations, detailAll: false })
    const keys = L.rows.map(rowKey)
    expect(keys).toContain("lane:modality:robotica")
    const q = { ...SEED_QUADRANTS[0], rowFrom: "lane:modality:robotica", rowTo: "lane:modality:tecnico" }
    const a = quadrantRows(q, L.rows, L.total)
    const rob = L.rows[keys.indexOf("lane:modality:robotica")]
    const tec = L.rows[keys.indexOf("lane:modality:tecnico")]
    expect([a.top, a.bottom, a.anchored]).toEqual([rob.top, tec.top + tec.h, true])
    // Expanding a course above shifts the rows; the anchors follow them.
    const L2 = computeModalities({ doc, items, fins: doc.finRecords ?? [], ref: REF, expanded: ["jornada-2025"], collapsedModalities: [], hiddenProjects: [], hideSettled: [], finFilter: "all", consolidations: doc.consolidations, detailAll: false })
    const k2 = L2.rows.map(rowKey)
    const b = quadrantRows(q, L2.rows, L2.total)
    expect(b.top).toBe(L2.rows[k2.indexOf("lane:modality:robotica")].top)
    // Missing anchors → whole height, never an error.
    expect(quadrantRows({ ...q, rowFrom: "lane:modality:nao-existe", rowTo: null }, L.rows, L.total)).toEqual({ top: 0, bottom: L.total, anchored: false })
  })
})

describe("V18 — carimbo financeiro", () => {
  it("lê o projeto financiador e o estado do registro de aquisição, não a cor da barra", () => {
    const doc = createSeed()
    const fins = finRecordsIn(doc, "baseline")
    const items = applyScenario(doc, "baseline")
    const stamp = (id: string) => financeStamp(items.find((i) => i.id === id)!, acqOf(fins, id), short(doc)).label
    expect(stamp("p1-tecnico")).toBe("P1 · Pago")
    expect(stamp("t1")).toBe("P2 · Pago")
    expect(stamp("rob-2026")).toBe("P2 · Parcelas")
    expect(stamp("rob-2027")).toBe("Cotação")
    expect(stamp("t2")).toBe("A contratar")
    expect(stamp("jornada-2025")).toBe("Financiamento a definir")
    // A visual edit (colour, line) never changes the stamp.
    const styled = writeVisual(doc, "baseline", "t1", { color: "#ff0000", style: { fill: "#00ff00" } })
    expect(financeStamp(applyScenario(styled, "baseline").find((i) => i.id === "t1")!, acqOf(finRecordsIn(styled, "baseline"), "t1"), short(styled)).label).toBe("P2 · Pago")
    // A P3 action without acquisition is a proposal, not an approval.
    expect(financeStamp({ projectId: "p3", certainty: "hipotese" }, undefined, short(doc))).toMatchObject({ label: "P3 · Proposta", tone: "proposal" })
    // Without a record no funder is named (the action's project only in the tooltip).
    const none = financeStamp(items.find((i) => i.id === "jornada-2026")!, undefined, short(doc))
    expect(none.label).toBe("A validar")
    expect(none.title).toMatch(/ação do P2/)
    // Partly paid is not "installments".
    const part = { ...acqOf(fins, "t1")!, acqStatus: "parcialmente_pago" as const }
    expect(financeStamp(items.find((i) => i.id === "t1")!, part, short(doc))).toMatchObject({ label: "P2 · Parcial", tone: "partial" })
  })

  it("o carimbo lê a aquisição mesmo com o projeto financiador oculto", () => {
    let doc = createSeed()
    // T1 co-funded by P1, so it stays visible with P2 hidden.
    doc = setFunding(doc, "t1", [{ projectId: "p1" }, { projectId: "p2" }])
    const items = applyScenario(doc, "baseline")
    const L = computeModalities({ doc, items, fins: doc.finRecords ?? [], ref: REF, expanded: [], collapsedModalities: [], hiddenProjects: ["p2"], hideSettled: [], finFilter: "all", consolidations: doc.consolidations, detailAll: false })
    const lane = L.rows.find((r): r is Extract<typeof r, { type: "lane" }> => r.type === "lane" && r.kind === "modality" && r.modality === "tecnico")!
    const t1 = lane.members.find((m) => m.item.id === "t1")
    expect(t1?.stamp?.label).toBe("P2 · Pago")
  })
})

describe("V18 — dados e migração", () => {
  it("Técnico 1 em 18/02/2026–dez/2027; Robótica 2026 em parcelas de R$ 4.480; Robótica 2027 com cotação de R$ 44.800", () => {
    const doc = createSeed()
    const t1 = doc.items.find((i) => i.id === "t1")!
    expect([t1.start, t1.end]).toEqual(["2026-02-18", "2027-12-31"])
    const fins = doc.finRecords!
    expect(acqOf(fins, "t1")).toMatchObject({ contractValue: 298012, acqStatus: "integralmente_pago", fundingProjectId: "p2" })
    expect(acqOf(fins, "rob-2026")).toMatchObject({ paymentMode: "parcelas", installmentValue: 4480 })
    expect(acqOf(fins, "rob-2027")).toMatchObject({ acqStatus: "cotacao", quoteValue: 44800 })
    expect(doc.items.find((i) => i.id === "rob-2026")!.start).toBe("2026-03-14")
    // T2 2028–2029 in the latest planning; the 2027–2028 records stay as their own scenario.
    expect(doc.items.find((i) => i.id === "t2")).toMatchObject({ start: "2028-01-01", end: "2029-12-31", certainty: "hipotese" })
    expect(doc.scenarios.some((s) => s.id === "cen-tecnico-2027")).toBe(true)
  })

  it("migra o documento V11 de fábrica para exatamente o seed V18, uma única vez", () => {
    const v11 = createSeedV11()
    expect(v11.settings.modelVersion).toBe(11)
    expect(needsMigration(v11)).toBe(true)
    const m = normalizeDoc(v11)
    const seed = createSeed()
    expect(m.settings.modelVersion).toBe(18)
    expect(m.items).toEqual(seed.items)
    expect(m.finRecords).toEqual(seed.finRecords)
    expect(m.turmas).toEqual(seed.turmas)
    expect(m.scenarios).toEqual(seed.scenarios)
    expect(m.quadrants!.map((q) => q.id)).toEqual(["q-apos-vigencia-p2", "q-projeto3"])
    // IDs preserved, none duplicated; a second pass changes nothing.
    expect(m.items.map((i) => i.id)).toEqual(expect.arrayContaining(v11.items.map((i) => i.id)))
    expect(new Set(m.items.map((i) => i.id)).size).toBe(m.items.length)
    expect(new Set(m.finRecords!.map((f) => f.id)).size).toBe(m.finRecords!.length)
    expect(normalizeDoc(m)).toBe(m)
    const again = applyV18({ ...m, settings: { ...m.settings, modelVersion: 11 } }, createSeedV11())
    expect(again.items).toEqual(m.items)
    expect(again.finRecords).toEqual(m.finRecords)
    expect(again.turmas).toEqual(m.turmas)
  })

  it("um registro editado pelo usuário não é remodelado (nome, notas, certeza, tipo)", () => {
    const v11 = createSeedV11()
    const edited: StudioDoc = { ...v11, items: v11.items.map((i) => (i.id === "p1-tecnico" ? { ...i, name: "Curso Técnico Piloto — Informática", notes: "minha nota" } : i)) }
    const before = edited.items.find((i) => i.id === "p1-tecnico")!
    const m = normalizeDoc(edited)
    const after = m.items.find((i) => i.id === "p1-tecnico")!
    expect(after).toEqual(before)
    // its turma is not created either: nothing would point to it
    expect(m.turmas!.some((t) => t.id === "turma-tec-2024")).toBe(false)
  })

  it("não duplica o pagamento antecipado do Técnico 1 nem as aquisições do P1 já cadastradas", () => {
    let v11 = createSeedV11()
    const t1 = v11.items.find((i) => i.id === "t1")!
    v11 = newFin(v11, "pagamento", t1, { parentId: "fin-t1-aquisicao", realized: true, value: 298012, start: "2025-09-15", end: "2025-09-15" }).doc
    v11 = newFin(v11, "aquisicao", v11.items.find((i) => i.id === "p1-robotica")!, { acqStatus: "integralmente_pago" }).doc
    const m = normalizeDoc(v11)
    const pays = m.finRecords!.filter((f) => f.kind === "pagamento" && f.parentId === "fin-t1-aquisicao")
    expect(pays).toHaveLength(1)
    expect(summarize(m.finRecords!, new Set(["t1", "t1-bolsas"]))).toMatchObject({ contracted: 298012, paid: 298012, balance: 0 })
    expect(m.finRecords!.filter((f) => f.kind === "aquisicao" && f.actionId === "p1-robotica")).toHaveLength(1)
    // the T1 contract value is credited to the V18 briefing, and the user's notes are kept
    expect(m.finRecords!.find((f) => f.id === "fin-t1-aquisicao")!.sourceIds).toContain(SRC_V18)
  })

  it("Técnico futuro: tudo ou nada — com o T2 editado, nada do T2 é movido", () => {
    const v11 = createSeedV11()
    const edited: StudioDoc = { ...v11, items: v11.items.map((i) => (i.id === "t2" ? { ...i, end: "2028-06-30" } : i)) }
    const m = normalizeDoc(edited)
    expect(m.items.find((i) => i.id === "t2")).toEqual(edited.items.find((i) => i.id === "t2"))
    expect(m.items.find((i) => i.id === "t2-bolsas")).toEqual(edited.items.find((i) => i.id === "t2-bolsas"))
    expect(m.scenarios.some((s) => s.id === "cen-tecnico-2027")).toBe(false)
    expect(m.turmas!.find((t) => t.id === "turma-tec-2027")!.offeringId).toBe("t2")
    expect(m.turmas!.some((t) => t.id === "turma-tec-2028")).toBe(false)
  })

  it("as bolsas do T2 seguem a turma: 2028–2029 na base, 2027–2028 no cenário próprio", () => {
    const doc = createSeed()
    expect(doc.items.find((i) => i.id === "t2-bolsas")!.turmaIds).toEqual(["turma-tec-2028"])
    const sc = applyScenario(doc, "cen-tecnico-2027")
    expect(sc.find((i) => i.id === "t2-bolsas")).toMatchObject({ start: "2027-02-01", turmaIds: ["turma-tec-2027"] })
  })

  it("vincular turma dentro do cenário 2027–2028 não reescreve a linha de base", () => {
    const doc = createSeed()
    const t = newTurmaFor(doc, doc.items.find((i) => i.id === "t2")!, "cen-tecnico-2027")
    expect(t.doc.items.find((i) => i.id === "t2")!.turmaIds).toEqual(["turma-tec-2028"])
    expect(t.doc.scenarios.find((s) => s.id === "cen-tecnico-2027")!.overrides.t2.turmaIds).toEqual(["turma-tec-2027", t.id])
    const del = deleteTurma(t.doc, "turma-tec-2027")
    expect(del.scenarios.find((s) => s.id === "cen-tecnico-2027")!.overrides.t2.turmaIds).toEqual([t.id])
    // outside a scenario that sets turmas, the record itself is edited
    expect(setItemTurmas(doc, "t1", (cur) => [...cur, "x"], "baseline").items.find((i) => i.id === "t1")!.turmaIds).toContain("x")
    expect(scenarioSetsTurmas(doc, "cen-tecnico-2027", "t2")).toBe(true)
    expect(scenarioSetsTurmas(doc, "baseline", "t2")).toBe(false)
    // emptied in the scenario → no turma there (no fallback to the baseline's turma)
    const emptied = setItemTurmas(doc, "t2", () => [], "cen-tecnico-2027")
    expect(emptied.items).toBe(doc.items)
    expect(turmasOf(emptied, applyScenario(emptied, "cen-tecnico-2027").find((i) => i.id === "t2")!)).toEqual([])
    expect(turmasOf(emptied, applyScenario(emptied, "baseline").find((i) => i.id === "t2")!).map((t) => t.id)).toEqual(["turma-tec-2028"])
  })

  it("não sobrescreve quadrantes nem datas editadas pelo usuário", () => {
    const seed = createSeed()
    const edited: StudioDoc = {
      ...seed,
      settings: { ...seed.settings, modelVersion: 11 },
      quadrants: [{ ...SEED_QUADRANTS[0], color: "#000000" }],
    }
    const m = applyV18(edited)
    expect(m.quadrants!.find((q) => q.id === "q-apos-vigencia-p2")!.color).toBe("#000000")
  })
})
