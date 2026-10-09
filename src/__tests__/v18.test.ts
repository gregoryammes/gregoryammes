import { describe, expect, it } from "vitest"
import { toDay } from "@/lib/dates"
import { applyScenario } from "@/lib/analysis"
import { financeStamp, finRecordsIn, acqOf } from "@/lib/finance"
import { quadrantRange, quadrantRows, ruleRange, rowKey } from "@/lib/quadrants"
import { computeModalities } from "@/lib/modalities"
import { createSeed } from "@/data/seed"
import { applyV18, SEED_QUADRANTS } from "@/data/v18"
import { needsMigration, normalizeDoc } from "@/data/migrate"
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

  it("migra um documento V11 uma única vez, preservando IDs e sem duplicar registros", () => {
    const seed = createSeed()
    const v11: StudioDoc = { ...seed, quadrants: undefined, settings: { ...seed.settings, modelVersion: 11 } }
    expect(needsMigration(v11)).toBe(true)
    const m = normalizeDoc(v11)
    expect(m.settings.modelVersion).toBe(18)
    expect(m.items.map((i) => i.id)).toEqual(expect.arrayContaining(v11.items.map((i) => i.id)))
    expect(new Set(m.items.map((i) => i.id)).size).toBe(m.items.length)
    expect(new Set(m.finRecords!.map((f) => f.id)).size).toBe(m.finRecords!.length)
    expect(m.quadrants!.map((q) => q.id)).toEqual(["q-apos-vigencia-p2", "q-projeto3"])
    expect(normalizeDoc(m)).toBe(m)
    // Running the step again changes nothing: it is idempotent.
    const again = applyV18({ ...m, settings: { ...m.settings, modelVersion: 11 } })
    expect(again.items.length).toBe(m.items.length)
    expect(again.finRecords!.length).toBe(m.finRecords!.length)
    expect(again.quadrants!.length).toBe(m.quadrants!.length)
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
