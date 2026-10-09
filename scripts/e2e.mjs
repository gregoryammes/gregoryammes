// Acceptance run for the 10 flows of the briefing. Usage: npm run dev, then `node scripts/e2e.mjs [url]`.
import { chromium } from "playwright-core"
import fs from "node:fs"

const URL = process.argv[2] ?? "http://localhost:5173/"
const OUT = process.env.E2E_OUT ?? "e2e-shots"
fs.mkdirSync(OUT, { recursive: true })
const exe = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const browser = await chromium.launch({ executablePath: exe })
const ctx = await browser.newContext({ viewport: { width: 1680, height: 960 }, acceptDownloads: true })
const page = await ctx.newPage()
const errors = []
page.on("pageerror", (e) => errors.push(String(e)))
page.on("dialog", (d) => d.accept())
const results = []
const ok = (name, cond, detail = "") => {
  results.push({ name, pass: !!cond, detail })
  console.log(`${cond ? "PASS" : "FAIL"} · ${name}${detail ? " — " + detail : ""}`)
}
const S = () => page.evaluate(() => {
  const s = window.__studio.getState()
  const sc = s.doc.scenarios.find((x) => x.id === s.scenarioId)
  const eff = (id) => ({ ...s.doc.items.find((i) => i.id === id), ...(sc.kind === "baseline" ? {} : sc.overrides[id]) })
  return { scenarioId: s.scenarioId, t1: eff("t1"), vigBase: s.doc.items.find((i) => i.id === "p2-vigencia"), vigWork: s.doc.scenarios.find((x) => x.id === "working").overrides["p2-vigencia"], past: s.past.length, future: s.future.length, items: s.doc.items.map((i) => i.name) }
})
const box = async (sel) => (await page.locator(sel).first().boundingBox())
async function drag(sel, dx, dy = 0, at = "center") {
  const b = await box(sel)
  const x = at === "center" ? b.x + b.width / 2 : b.x + b.width / 2
  const y = b.y + b.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  for (let i = 1; i <= 8; i++) await page.mouse.move(x + (dx * i) / 8, y + (dy * i) / 8)
  await page.mouse.up()
  await page.waitForTimeout(150)
}

await page.goto(URL, { waitUntil: "networkidle" })
await page.evaluate(() => localStorage.clear())
await page.reload({ waitUntil: "networkidle" })
await page.waitForTimeout(600)

// T5 first, on pristine data: continuity after the vigência is visible.
ok("T5 continuidade (Técnico 1 após vigência)", (await page.locator("#timeline-svg text", { hasText: /^\+6 m$|6 meses após a vigência/ }).count()) >= 1)
await page.screenshot({ path: `${OUT}/01-studio.png` })

// T1 create a course
await page.getByRole("button", { name: "Novo: Curso" }).click()
await page.locator('[role=dialog] input').first().fill("Curso E2E")
await page.locator('[role=dialog] input[type=date]').nth(0).fill("2026-03-01")
await page.locator('[role=dialog] input[type=date]').nth(1).fill("2026-11-30")
await page.getByRole("button", { name: "Cadastrar" }).click()
await page.waitForTimeout(300)
const created = await page.evaluate(() => window.__studio.getState().doc.items.find((i) => i.name === "Curso E2E"))
ok("T1 criar curso", created && created.start === "2026-03-01" && (await page.locator(`#timeline-svg rect[data-id="${created.id}"]`).count()) > 0, created?.id)

// T2 drag Técnico 1 horizontally (month snap): dates change, duration constant
await page.evaluate(() => window.__studio.getState().select([]))
const before = await S()
await drag('#timeline-svg rect[data-hit=item][data-id=t1]', 120)
const afterMove = await S()
const len = (t) => (Date.parse(t.end) - Date.parse(t.start)) / 864e5
ok("T2 arrastar altera datas", afterMove.t1.start !== before.t1.start, `${before.t1.start} → ${afterMove.t1.start}`)
ok("T2 duração constante", Math.abs(len(afterMove.t1) - len(before.t1)) <= 0, `${len(before.t1)} d`)

// T9 undo / redo the move
await page.keyboard.press("Control+z")
let u = await S()
ok("T9 desfazer", u.t1.start === before.t1.start && u.t1.end === before.t1.end)
await page.keyboard.press("Control+Shift+z")
u = await S()
ok("T9 refazer", u.t1.start === afterMove.t1.start)
await page.keyboard.press("Control+z")

// T3 resize from the right edge
await page.evaluate(() => window.__studio.getState().select(["t1"]))
await page.waitForTimeout(100)
await drag('#timeline-svg rect[data-hit=item-r][data-id=t1]', 90)
const afterResize = await S()
ok("T3 redimensionar (fim)", afterResize.t1.end !== before.t1.end && afterResize.t1.start === before.t1.start, `${before.t1.end} → ${afterResize.t1.end}`)
await drag('#timeline-svg rect[data-hit=item-l][data-id=t1]', -90)
const afterResizeL = await S()
ok("T3 redimensionar (início)", afterResizeL.t1.start !== before.t1.start, `${before.t1.start} → ${afterResizeL.t1.start}`)
await page.keyboard.press("Control+z")
await page.keyboard.press("Control+z")

// T4 change the vigência: baseline is protected, the change lands in the working scenario
await page.evaluate(() => window.__studio.getState().select(["p2-vigencia"]))
await page.waitForTimeout(100)
await drag('#timeline-svg rect[data-hit=item-r][data-id=p2-vigencia]', 160)
const v = await S()
ok("T4 vigência alterada só no cenário", v.scenarioId === "working" && v.vigBase.end === "2027-06-30" && v.vigWork?.end && v.vigWork.end > "2027-06-30", `base ${v.vigBase.end} · trabalho ${v.vigWork?.end}`)
const hypRow = await page.locator("#timeline-svg text", { hasText: "Vigência — cenário simulado" }).count()
const hypCaption = await page.locator("#timeline-svg text", { hasText: "cenário simulado (não aprovado)" }).count()
ok("T4 vigência simulada em linha própria, distinta da documental", hypRow === 1 && hypCaption === 1)
await page.screenshot({ path: `${OUT}/02-scenario.png` })

// T6 presentation matches the active scenario
const expected = await page.evaluate(() => {
  const s = window.__studio.getState()
  const sc = s.doc.scenarios.find((x) => x.id === s.scenarioId)
  return { ...s.doc.items.find((i) => i.id === "p2-vigencia"), ...sc.overrides["p2-vigencia"] }.end.split("-").reverse().join("/")
})
await page.getByRole("button", { name: "Apresentar", exact: true }).click()
await page.waitForTimeout(900)
await page.keyboard.press("4")
await page.waitForTimeout(1200)
const cap = await page.locator("svg text", { hasText: "hipótese de cenário" }).first().textContent()
ok("T6 Diretoria = cenário ativo", !!cap && cap.includes(expected) && (await page.locator("text=SIMULAÇÃO").count()) > 0, `${expected}`)
await page.screenshot({ path: `${OUT}/03-board-scenario.png` })

// back to baseline for the narrative
await page.locator('select[aria-label="Cenário apresentado"]').selectOption("baseline")
await page.waitForTimeout(500)

// T7 explain vigência
await page.getByRole("button", { name: /EXPLICAR VIGÊNCIA/ }).click()
for (let i = 0; i < 6; i++) {
  await page.keyboard.press("ArrowRight")
  await page.waitForTimeout(250)
}
await page.waitForTimeout(1000)
ok("T7 Explicar Vigência (7 etapas)", (await page.locator("text=Etapa 7 de 7").count()) === 1 && (await page.locator("text=Cenários do Projeto 3").count() + (await page.locator("text=Linha de base documental").count())) >= 1)
await page.screenshot({ path: `${OUT}/04-explain.png` })
await page.getByRole("button", { name: "Voltar" }).click()
ok("T7 reversível", (await page.locator("text=Etapa 6 de 7").count()) === 1)
await page.keyboard.press("Escape")

// T8 edit course in Studio → board updates
await page.getByRole("button", { name: /Estúdio/ }).click()
await page.waitForTimeout(300)
await page.evaluate(() => window.__studio.getState().select(["t1"]))
await page.waitForTimeout(200)
const endInput = page.getByLabel("Fim do período")
await endInput.fill("2028-03-31")
await endInput.blur()
await page.waitForTimeout(200)
await page.getByRole("button", { name: "Apresentar", exact: true }).click()
await page.waitForTimeout(1300)
const t1kpi = await page.locator("p", { hasText: "meses-calendário" }).first().innerText()
ok("T8 sincronização Estúdio → Diretoria", t1kpi.includes("9 meses") && t1kpi.includes("jul/2027 a mar/2028"), t1kpi.replace(/\n/g, " "))
await page.screenshot({ path: `${OUT}/05-board-sync.png` })
await page.getByRole("button", { name: /Estúdio/ }).click()

// T10 save + reload, and JSON export/import
await page.keyboard.press("Control+s")
await page.waitForTimeout(300)
await page.reload({ waitUntil: "networkidle" })
await page.waitForTimeout(600)
const persisted = await S()
ok("T10 persistência (salvar + recarregar)", persisted.t1.end === "2028-03-31" && persisted.items.includes("Curso E2E"))
await page.getByRole("button", { name: "Exportar", exact: true }).click()
const [dl] = await Promise.all([page.waitForEvent("download"), page.getByText("Exportar JSON (backup completo)").click()])
const file = `${OUT}/backup.json`
await dl.saveAs(file)
await page.getByRole("dialog").getByRole("button", { name: "Fechar", exact: true }).last().click()
const json = JSON.parse(fs.readFileSync(file, "utf8"))
ok("T10 exportar JSON", json.schema === "ska-temporal-studio/1" && json.items.some((i) => i.name === "Curso E2E"))
await page.evaluate(() => window.__studio.getState().resetToSeed())
await page.getByRole("button", { name: "Exportar", exact: true }).click()
await page.locator("input[type=file]").setInputFiles(file)
await page.waitForTimeout(400)
const imported = await S()
ok("T10 importar JSON", imported.items.includes("Curso E2E") && imported.t1.end === "2028-03-31")


// ════════════════════════ V6 — Temporal Intelligence ════════════════════════
await page.evaluate(() => localStorage.clear())
await page.reload({ waitUntil: "networkidle" })
await page.waitForTimeout(700)
const svgIds = () => page.evaluate(() => [...new Set([...document.querySelectorAll("#timeline-svg [data-hit=item]")].map((e) => e.getAttribute("data-id")))])
const storeCount = () => page.evaluate(() => window.__studio.getState().doc.items.length)
const before6 = await storeCount()

// V6-1 Somente Projetos
await page.locator('select[aria-label="Exibição da timeline"]').selectOption("projects")
await page.waitForTimeout(250)
let ids = await svgIds()
ok("V6-1 Somente Projetos: só P1, P2 e P3", ids.length === 3 && ids.every((x) => /-ciclo$/.test(x)), ids.join(","))
await page.screenshot({ path: `${OUT}/v6-01-projetos.png` })

// V6-2 P1 e P3 ocultos
await page.locator('select[aria-label="Exibição da timeline"]').selectOption("all")
await page.getByRole("button", { name: /P1$/ }).click()
await page.getByRole("button", { name: /P3$/ }).click()
await page.waitForTimeout(250)
ids = await svgIds()
const projOf = await page.evaluate((list) => list.map((id) => window.__studio.getState().doc.items.find((i) => i.id === id)?.projectId), ids)
ok("V6-2 Só o Projeto 2 e seus elementos", ids.length > 0 && projOf.every((p) => p === "p2") && (await storeCount()) === before6, `${ids.length} visíveis · registros ${await storeCount()}`)
await page.getByText("mostrar todos").click()

// V6-3 Técnico 1 → turma vinculada, editável
await page.evaluate(() => window.__studio.getState().select(["t1"]))
await page.waitForTimeout(250)
const panel = page.locator("aside[aria-label=Propriedades]")
ok("V6-3 Técnico 1 mostra a turma vinculada", (await panel.getByText("Turma Técnico 2026–2027").count()) >= 1 && (await panel.getByText("Técnico 1 · Turma 2026–2027").count()) >= 1)
const nameInput = panel.getByLabel("Nome da turma")
await nameInput.fill("Turma Técnico 2026–2027 (editada)")
await nameInput.blur()
await page.waitForTimeout(150)
const edited = await page.evaluate(() => window.__studio.getState().doc.turmas.find((t) => t.id === "turma-tec-2026").name)
ok("V6-3 turma editável pelo painel", edited.endsWith("(editada)"))

// V6-11 desfazer restaura o vínculo/nome
await page.keyboard.press("Control+z")
await page.waitForTimeout(100)
const undone = await page.evaluate(() => window.__studio.getState().doc.turmas.find((t) => t.id === "turma-tec-2026").name)
ok("V6-11 desfazer restaura a turma", undone === "Turma Técnico 2026–2027", undone)
await page.evaluate(() => window.__studio.getState().select([]))

// V6-4 filtro de turma
await page.getByRole("button", { name: /Turma:/ }).click()
await page.getByRole("dialog", { name: "Filtro de turmas" }).getByRole("button", { name: /Turma Técnico 2026–2027/ }).click()
await page.getByRole("dialog", { name: "Filtro de turmas" }).getByRole("button", { name: "Ocultar", exact: true }).click()
await page.mouse.click(5, 300)
await page.waitForTimeout(250)
ids = await svgIds()
const allowed = new Set(["t1", "t1-bolsas", "p2-vigencia", "p1-ciclo", "p2-ciclo", "p3-ciclo"])
const vigLine = await page.locator("#timeline-svg text", { hasText: "encerramento de referência" }).count()
ok("V6-4 filtro de turma: só relacionadas + vigência", ids.length > 0 && ids.every((x) => allowed.has(x)) && ids.includes("t1") && ids.includes("t1-bolsas") && vigLine > 0, ids.join(","))
await page.screenshot({ path: `${OUT}/v6-04-turma.png` })
await page.getByRole("button", { name: "Limpar filtro de turma" }).click()

// V6-5 Bolsas de Inglês consolidadas
const consLabel = await page.locator("#timeline-svg [data-hit=cons-label]").count()
ids = await svgIds()
const ing = await page.evaluate(() => window.__studio.getState().doc.items.filter((i) => i.consolidation === "ingles").map((i) => i.id))
ok("V6-5 uma linha Bolsas de Inglês, 3 registros preservados", consLabel === 1 && ing.length === 3 && ing.every((x) => ids.includes(x)), ing.join(","))
await page.locator("#timeline-svg [data-hit=cons-label]").click()
await page.waitForTimeout(200)
ok("V6-5 painel do programa consolidado", (await panel.getByText("Programa consolidado").count()) === 1 && (await panel.getByText(/Alunos distintos/).count()) === 1)
await page.evaluate(() => window.__studio.getState().select([]))

// V6-6 Dois Tempos
await page.getByRole("tab", { name: /Dois Tempos/ }).click()
await page.waitForTimeout(400)
const tt = page.locator('svg[aria-label^="Dois tempos"]')
ok("V6-6 Dois Tempos: vigência e execução no mesmo eixo", (await tt.locator("text", { hasText: "TEMPO 1" }).count()) === 1 && (await tt.locator("text", { hasText: "TEMPO 2" }).count()) === 1 && (await tt.locator("text", { hasText: /Vigência de referência/ }).count()) === 1)
await page.screenshot({ path: `${OUT}/v6-06-dois-tempos.png` })

// V6-7 alterar fim do Técnico 1 recalcula
await page.evaluate(() => window.__studio.getState().patchItem("t1", { end: "2028-03-31" }, "teste"))
await page.waitForTimeout(250)
const chip = await page.locator("text=/Parcialmente após a vigência · 9 m/").count()
ok("V6-7 trecho posterior recalculado (9 m)", chip >= 1)
await page.keyboard.press("Control+z")

// V6-8 cenário com vigência até dez/2027
await page.getByRole("tab", { name: /Linha do tempo/ }).click()
await page.locator('select[aria-label="Cenário ativo"]').selectOption("alt-prorrogacao")
await page.waitForTimeout(300)
const docCap = await page.locator("#timeline-svg text", { hasText: "linha de base documental" }).first().textContent()
const hypCap = await page.locator("#timeline-svg text", { hasText: "cenário simulado (não aprovado)" }).first().textContent()
const baseVig = await page.evaluate(() => window.__studio.getState().doc.items.find((i) => i.id === "p2-vigencia").end)
ok("V6-8 marco documental 30/06/2027 preservado + hipótese 31/12/2027 separada", !!docCap?.includes("30/06/2027") && !!hypCap?.includes("31/12/2027") && baseVig === "2027-06-30", `${docCap} | ${hypCap}`)
await page.screenshot({ path: `${OUT}/v6-08-cenario.png` })

// V6-10 Diretoria = cenário do editor
await page.getByRole("button", { name: "Apresentar", exact: true }).click()
await page.waitForTimeout(900)
await page.keyboard.press("4")
await page.waitForTimeout(1100)
const boardHyp = await page.locator("svg text", { hasText: "hipótese de cenário" }).first().textContent()
ok("V6-10 Diretoria segue o cenário ativo", !!boardHyp?.includes("31/12/2027") && (await page.locator("text=SIMULAÇÃO").count()) > 0, boardHyp ?? "")
await page.screenshot({ path: `${OUT}/v6-10-diretoria.png` })
await page.getByRole("button", { name: /Estúdio/ }).click()
await page.locator('select[aria-label="Cenário ativo"]').selectOption("baseline")

// V6-9 Jornada formativa por turma
await page.getByRole("tab", { name: /Jornada/ }).click()
await page.getByRole("tab", { name: "Jornada real por turma" }).click()
await page.waitForTimeout(300)
const jt = await page.locator("main").innerText()
ok("V6-9 Jornada por turma consistente com os registros", jt.includes("Turma Técnico 2026–2027") && jt.includes("Técnico — 1º ano") && jt.includes("Curso Técnico 1") && jt.includes("não informado"))
await page.screenshot({ path: `${OUT}/v6-09-jornada.png` })

// V6-12 salvar e reabrir preserva dados e configurações
await page.getByRole("tab", { name: /Linha do tempo/ }).click()
await page.locator('select[aria-label="Exibição da timeline"]').selectOption("projects")
await page.keyboard.press("Control+s")
await page.waitForTimeout(300)
await page.reload({ waitUntil: "networkidle" })
await page.waitForTimeout(600)
const after12 = await page.evaluate(() => ({ turmas: window.__studio.getState().doc.turmas.length, ing: window.__studio.getState().doc.items.filter((i) => i.consolidation === "ingles").length }))
const mode12 = await page.locator('select[aria-label="Exibição da timeline"]').inputValue()
ok("V6-12 persistência de dados e da exibição", after12.turmas === 2 && after12.ing === 3 && mode12 === "projects", JSON.stringify({ ...after12, mode12 }))

// ════════════════════════ V8 — Projeto → Curso → Componentes ════════════════════════
await page.evaluate(() => localStorage.clear())
await page.reload({ waitUntil: "networkidle" })
await page.waitForTimeout(700)
const SV = (fn) => page.evaluate(fn)
const svgText = async (re) => page.locator("#timeline-svg text", { hasText: re }).count()
const fins8 = () => SV(() => JSON.stringify(window.__studio.getState().doc.finRecords))
const item8 = (id) => page.evaluate((x) => JSON.stringify(window.__studio.getState().doc.items.find((i) => i.id === x)), id)
const mode8 = await page.locator('select[aria-label="Exibição da timeline"]').inputValue()

// V8-1 Técnico 1 recolhido: uma linha principal com curso, turma, período e aquisição
let ids8 = await svgIds()
const t1Tag = await page.locator("#timeline-svg [data-tags] text", { hasText: /^Pago$/ }).count()
ok("V8-1 Técnico 1 recolhido em uma linha (curso · turma · aquisição)", mode8 === "courses" && ids8.includes("t1") && !ids8.includes("t1-bolsas") && t1Tag === 1 && (await svgText("Técnico 1 · Turma 2026–2027")) >= 1, `exibição ${mode8}`)
await page.screenshot({ path: `${OUT}/v8-01-recolhido.png` })

// V8-2 expandir mostra aquisição, bolsas, NF e materiais
await page.locator('#timeline-svg [data-hit=h-toggle][data-id=t1]').click()
await page.waitForTimeout(250)
ids8 = await svgIds()
ok("V8-2 Técnico 1 expandido: aquisição, bolsas, NF, materiais",
  ids8.includes("t1-bolsas") && (await svgText("Aquisição e pagamento")) >= 1 && (await svgText("Notas fiscais e comprovação")) >= 1 && (await svgText("Materiais e recursos")) >= 1 && (await svgText(/Integralmente pago \(registro\)/)) === 1)
await page.screenshot({ path: `${OUT}/v8-02-expandido.png` })

// V8-3 Técnico 2: previsto, negociação concluída, formalização pendente
await page.locator('#timeline-svg [data-hit=h-toggle][data-id=t2]').click()
await page.waitForTimeout(250)
ok("V8-3 Técnico 2: negociação concluída, compra a formalizar, NF e pagamento previstos",
  (await svgText(/^Compra a formalizar$/)) === 1 && (await svgText("negociação concluída")) >= 1 && (await svgText("NF única (prevista) · data a definir")) === 1 && (await svgText("Pagamento único (previsto) · data a definir")) === 1)
await page.screenshot({ path: `${OUT}/v8-03-tecnico2.png` })

// V8-4 alterar a situação da aquisição não altera as bolsas nem o curso
const bolsaBefore = await item8("t1-bolsas")
const t1Before = await item8("t1")
await page.locator('#timeline-svg [data-hit=fin][data-id=fin-t1-aquisicao]').first().click()
await page.waitForTimeout(200)
await panel.getByLabel("Situação da aquisição").selectOption("parcialmente_pago")
await page.waitForTimeout(200)
const acq4 = await SV(() => window.__studio.getState().doc.finRecords.find((f) => f.id === "fin-t1-aquisicao").acqStatus)
ok("V8-4 aquisição alterada sem tocar bolsas e curso", acq4 === "parcialmente_pago" && (await item8("t1-bolsas")) === bolsaBefore && (await item8("t1")) === t1Before && (await svgText(/^Parcialmente pago$/)) === 1, acq4)
await page.keyboard.press("Control+z")
await page.waitForTimeout(150)
ok("V8-4 desfazer restaura a aquisição", (await SV(() => window.__studio.getState().doc.finRecords.find((f) => f.id === "fin-t1-aquisicao").acqStatus)) === "integralmente_pago")
await page.evaluate(() => window.__studio.getState().select([]))

// V8-5 desmarcar P1: ações exclusivas ocultas, nada excluído
const count5 = await storeCount()
const fins5 = await fins8()
await page.getByRole("button", { name: /P1$/ }).click()
await page.waitForTimeout(250)
ids8 = await svgIds()
ok("V8-5 P1 oculto: ações exclusivas somem, registros intactos", !ids8.some((x) => x.startsWith("p1-")) && ids8.includes("t1") && ids8.includes("p2-vigencia") && (await storeCount()) === count5 && (await fins8()) === fins5, `${ids8.length} visíveis`)
await page.screenshot({ path: `${OUT}/v8-05-sem-p1.png` })

// V8-6 reativar P1: cursos e situação de pagamento (sem inventar status)
await page.getByRole("button", { name: /P1$/ }).click()
await page.waitForTimeout(250)
ids8 = await svgIds()
ok("V8-6 P1 reexibido com cursos históricos e 'Pagamento a validar'", ["p1-ciclo", "p1-tecnico", "p1-jornada", "p1-robotica"].every((x) => ids8.includes(x)) && (await svgText(/^Pagamento a validar$/)) >= 4 && (await svgText("Curso Técnico Piloto")) >= 1)

// V8-7 vínculo múltiplo: ação do P1 com participação do P2 continua visível sem P1
await page.evaluate(() => window.__studio.getState().select(["p1-robotica"]))
await page.waitForTimeout(250)
await panel.getByRole("button", { name: "Adicionar projeto participante" }).click()
await page.waitForTimeout(150)
const fund7 = await SV(() => window.__studio.getState().doc.items.find((i) => i.id === "p1-robotica").funding)
await page.evaluate(() => window.__studio.getState().select([]))
await page.getByRole("button", { name: /P1$/ }).click()
await page.waitForTimeout(250)
ids8 = await svgIds()
ok("V8-7 ação compartilhada visível com P1 oculto", fund7?.[0]?.projectId === "p2" && ids8.includes("p1-robotica") && !ids8.includes("p1-jornada") && (await svgText(/participação do P2/)) === 1, JSON.stringify(fund7))
await page.screenshot({ path: `${OUT}/v8-07-vinculo.png` })
await page.getByRole("button", { name: /P1$/ }).click()
await page.keyboard.press("Control+z")
await page.waitForTimeout(150)

// V8-8 escala: barras que começam antes ou terminam depois da janela
await page.getByRole("button", { name: /^2025–2028/ }).click()
await page.getByRole("button", { name: "Histórico · 2023–2025" }).click()
await page.waitForTimeout(300)
const right8 = await page.locator("#timeline-svg [data-clip=right]").count()
await page.evaluate(() => window.__view.getState().setRange(2027, 2028))
await page.waitForTimeout(300)
const left8 = await page.locator("#timeline-svg [data-clip=left]").count()
const t1Visible = await page.locator('#timeline-svg [data-hit=item][data-id=t1]').count()
ok("V8-8 continuidade fora da janela indicada (◂ ▸), sem truncar em silêncio", right8 >= 1 && left8 >= 1 && t1Visible === 1, `direita ${right8} · esquerda ${left8}`)
await page.screenshot({ path: `${OUT}/v8-08-escala.png` })
await page.evaluate(() => window.__view.getState().setRange(2025, 2028))

// V8-9 Bolsas de Inglês: uma linha, ciclos expansíveis, registros preservados
await page.locator('#timeline-svg [data-hit=h-toggle][data-id=t2]').click()
await page.waitForTimeout(150)
await page.locator('#timeline-svg [data-hit=h-toggle][data-id="cons:ingles"]').click()
await page.waitForTimeout(250)
const ing9 = await SV(() => window.__studio.getState().doc.items.filter((i) => i.consolidation === "ingles").map((i) => i.id + ":" + i.partner))
ok("V8-9 Bolsas de Inglês consolidadas e expansíveis", (await page.locator("#timeline-svg [data-hit=cons-label]").count()) === 1 && ing9.length === 3 && (await svgText("KNN")) === 0 && (await svgText("Wizard")) === 0, ing9.join(","))

// V8-10 arrastar/redimensionar o curso não altera pagamentos e documentos
const fins10 = await fins8()
await drag('#timeline-svg rect[data-hit=item][data-id=t1]', 100)
const t1m = JSON.parse(await item8("t1"))
ok("V8-10 curso movido; aquisição, NF e pagamentos intactos", t1m.start !== "2026-02-18" && (await fins8()) === fins10, `${t1m.start} → ${t1m.end}`)
await page.keyboard.press("Control+z")
await page.waitForTimeout(150)
await page.evaluate(() => window.__studio.getState().select([]))

// V8-13 uma despesa em várias visões conta uma vez
await page.evaluate(() => {
  const s = window.__studio.getState()
  s.commit("pagamento de teste", (d) => ({ ...d, finRecords: [...d.finRecords, { id: "fin-e2e-pay", kind: "pagamento", name: "Pagamento e2e", actionId: "t1", parentId: "fin-t1-aquisicao", start: "2026-03-10", end: "2026-03-10", realized: true, value: 1000, fundingProjectId: "p2", proof: "pendente", linkStatus: "confirmado", sourceIds: [] }] }))
})
await page.locator('select[aria-label="Situação financeira"]').selectOption("paid")
await page.waitForTimeout(250)
await page.locator('#timeline-svg [data-hit=fin][data-id=fin-t1-aquisicao]').first().click()
await page.waitForTimeout(200)
const panel13 = await panel.innerText()
const sum13 = await svgText("pago R$ 1.000,00")
const n13 = await SV(() => window.__studio.getState().doc.finRecords.filter((f) => f.id === "fin-e2e-pay").length)
ok("V8-13 despesa única: R$ 1.000 (não 2.000) na linha e no painel, com filtro ativo", n13 === 1 && sum13 === 1 && /R\$\s1\.000,00/.test(panel13) && !/R\$\s2\.000,00/.test(panel13), `linha ${sum13} · registros ${n13}`)
await page.locator('select[aria-label="Situação financeira"]').selectOption("all")
await page.keyboard.press("Escape")

// V8-11 Diretoria: curso recolhido e componentes revelados por etapas
const past11 = await SV(() => window.__studio.getState().past.length)
await page.getByRole("button", { name: "Apresentar", exact: true }).click()
await page.waitForTimeout(900)
await page.keyboard.press("2")
await page.waitForTimeout(1300)
await page.getByRole("button", { name: "Curso Técnico 1" }).click()
await page.waitForTimeout(400)
const collapsed11 = await page.locator("text=curso recolhido").count()
await page.getByRole("button", { name: /Revelar próximo/ }).click()
await page.getByRole("button", { name: /Revelar próximo/ }).click()
await page.waitForTimeout(500)
ok("V8-11 Diretoria: síntese do curso recolhido + revelação progressiva sem alterar dados",
  collapsed11 === 1 && (await page.locator("text=2 de 5 componentes revelados").count()) === 1 && (await page.locator('svg[aria-label="Aquisição e pagamento"]').count()) === 1 && (await page.locator('svg[aria-label="Bolsas dos alunos"]').count()) === 1 && (await page.locator("text=Aquisição indicada como paga, conforme registros").count()) === 1 && (await SV(() => window.__studio.getState().past.length)) === past11)
await page.screenshot({ path: `${OUT}/v8-11-diretoria.png` })
await page.keyboard.press("Escape")
await page.getByRole("button", { name: /Estúdio/ }).click().catch(() => {})
await page.waitForTimeout(300)

// V8-12 salvar, reabrir: vínculos e estados
await page.evaluate(() => window.__studio.getState().select(["t1"]))
await page.waitForTimeout(200)
await panel.getByRole("button", { name: "Cadastrar nota fiscal" }).click()
await page.waitForTimeout(200)
await panel.getByLabel("Data do registro").fill("2026-04-15")
await panel.getByLabel("Data do registro").blur()
await panel.getByLabel("Número do documento").fill("123")
await panel.getByLabel("Número do documento").blur()
await page.waitForTimeout(150)
await page.keyboard.press("Control+s")
await page.waitForTimeout(300)
await page.reload({ waitUntil: "networkidle" })
await page.waitForTimeout(700)
const p12 = await SV(() => {
  const d = window.__studio.getState().doc
  const nf = d.finRecords.find((f) => f.kind === "nf" && f.actionId === "t1")
  return { nf: nf && `${nf.start}|${nf.docNumber}|${nf.realized}`, acq: d.finRecords.find((f) => f.id === "fin-t1-aquisicao").acqStatus, t2: d.finRecords.find((f) => f.id === "fin-t2-aquisicao").steps.filter((s) => s.done).length, pay: d.finRecords.some((f) => f.id === "fin-e2e-pay"), v: d.settings.modelVersion }
})
const exp12 = await SV(() => window.__view.getState().expanded)
ok("V8-12 persistência de vínculos, estados e expansão", p12.nf === "2026-04-15|123|false" && p12.acq === "integralmente_pago" && p12.t2 === 2 && p12.pay && p12.v === 8 && exp12.includes("t1"), JSON.stringify({ ...p12, exp12 }))
await page.screenshot({ path: `${OUT}/v8-12-persistencia.png` })

ok("sem erros de página", errors.length === 0, errors.slice(0, 3).join(" | "))
await browser.close()
const failed = results.filter((r) => !r.pass)
console.log(`\n${results.length - failed.length}/${results.length} verificações aprovadas`)
process.exit(failed.length ? 1 : 0)
