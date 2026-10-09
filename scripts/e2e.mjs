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
await page.keyboard.press("3")
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
ok("V6-6 Dois Tempos: vigência e execução no mesmo eixo", (await tt.locator("text", { hasText: "TEMPO DO INSTRUMENTO" }).count()) === 1 && (await tt.locator("text", { hasText: "TEMPO DA FORMAÇÃO" }).count()) === 1 && (await tt.locator("text", { hasText: /Vigência de referência/ }).count()) === 1)
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
await page.keyboard.press("3")
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
await page.locator('select[aria-label="Exibição da timeline"]').selectOption("courses")
await page.waitForTimeout(250)
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
await panel.getByRole("tab", { name: "Dados" }).click()
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
await page.getByRole("tab", { name: "Cursos técnicos em detalhe" }).click()
await page.waitForTimeout(500)
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
await panel.getByRole("tab", { name: "Dados" }).click()
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
ok("V8-12 persistência de vínculos, estados e expansão", p12.nf === "2026-04-15|123|false" && p12.acq === "integralmente_pago" && p12.t2 === 2 && p12.pay && p12.v === 11 && exp12.includes("t1"), JSON.stringify({ ...p12, exp12 }))
await page.screenshot({ path: `${OUT}/v8-12-persistencia.png` })

// ════════════════════════ V11 — timeline visual, edição direta, Projeto 3 ════════════════════════
await page.evaluate(() => localStorage.clear())
await page.reload({ waitUntil: "networkidle" })
await page.waitForTimeout(800)
const st11 = () => SV(() => {
  const d = window.__studio.getState().doc
  return { items: d.items.length, ids: d.items.map((i) => i.id).join(","), fins: d.finRecords.map((f) => f.id).join(","), turmas: d.turmas.length, past: window.__studio.getState().past.length }
})
const base11 = await st11()
const t1json = () => item8("t1")

// V11-1 anos e meses visíveis; zoom mensal mostra a abreviação de cada mês
const mode11 = await page.locator('select[aria-label="Exibição da timeline"]').inputValue()
const years11 = await page.locator("#timeline-svg text", { hasText: /^202[5-8]$/ }).count()
await page.locator('select[aria-label="Zoom"]').selectOption("mensal")
await page.waitForTimeout(300)
const months11 = await page.locator("#timeline-svg text", { hasText: /^(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)$/ }).count()
const sem11 = await page.locator("#timeline-svg text", { hasText: /º sem/ }).count()
ok("V11-1 régua ano → semestre → mês; zoom mensal com meses legíveis", mode11 === "modalities" && years11 >= 3 && months11 >= 4 && sem11 >= 1, `${mode11} · anos ${years11} · semestres ${sem11} · meses ${months11}`)
await page.screenshot({ path: `${OUT}/v11-01-mensal.png` })
await page.locator('button[title^="Intervalo temporal exibido"]').click()
await page.getByRole("button", { name: "Ciclo atual · 2025–2028" }).click()
await page.waitForTimeout(300)

// V11-2 cores dos projetos consistentes (faixa, botões e fundo)
const c11 = await SV(() => ({
  p1: document.querySelector('#timeline-svg rect[data-hit=item][data-id="p1-ciclo"]')?.getAttribute("fill"),
  p2: document.querySelector('#timeline-svg rect[data-hit=item][data-id="p2-ciclo"]')?.getAttribute("fill"),
  p3: document.querySelector('#timeline-svg rect[data-hit=item][data-id="p3-ciclo"]')?.getAttribute("stroke"),
  p3dash: document.querySelector('#timeline-svg rect[data-hit=item][data-id="p3-ciclo"]')?.getAttribute("stroke-dasharray"),
  tints: document.querySelectorAll("#timeline-svg [data-project-tint]").length,
}))
ok("V11-2 P1 verde, P2 azul, P3 roxo tracejado, com fundo suave por projeto", c11.p1 === "#19885D" && c11.p2 === "#127BAF" && c11.p3 === "#8870B5" && !!c11.p3dash && c11.tints >= 3, JSON.stringify(c11))
await page.screenshot({ path: `${OUT}/v11-02-modalidades.png` })

// V11-3 modalidades em poucas linhas principais
const modNames = ["Jornada Tecnológica", "Robótica", "Cursos Técnicos", "Bolsas e Incentivos", "Operação e Infraestrutura"]
const modFound = []
for (const n of modNames) modFound.push((await page.locator("#timeline-svg [data-hit=m-collapse] text", { hasText: n }).count()) === 1)
const tecLanes = await SV(() => [...document.querySelectorAll("#timeline-svg [data-hit=m-collapse] text")].map((t) => t.textContent).join("|"))
ok("V11-3 cinco modalidades, edições lado a lado", modFound.every(Boolean) && /Cursos Técnicos\|3 registros · 2 linhas/.test(tecLanes), tecLanes.slice(0, 160))

// V11-4 expandir o curso mostra bolsas e componentes
await page.locator('#timeline-svg [data-hit=h-toggle][data-id=t1]').click()
await page.waitForTimeout(250)
ok("V11-4 Técnico 1 expandido: aquisição, bolsas, NF, materiais", (await svgText(/^Técnico 1 › Aquisição/)) === 1 && (await svgText("Notas fiscais e comprovação")) === 1 && (await svgText("Materiais e recursos")) === 1 && (await page.locator('#timeline-svg [data-hit=item][data-id="t1-bolsas"]').count()) >= 2)
await page.screenshot({ path: `${OUT}/v11-04-expandido.png` })
await page.locator('#timeline-svg [data-hit=h-toggle][data-id=t1]').click()
await page.waitForTimeout(200)

// V11-5 arrastar a barra altera as datas, mantendo a duração
const t1a = JSON.parse(await t1json())
await drag('#timeline-svg rect[data-hit=item][data-id=t1]', 110)
const t1b = JSON.parse(await t1json())
const dur = (t) => (Date.parse(t.end) - Date.parse(t.start)) / 864e5
ok("V11-5 arrastar altera datas (duração constante)", t1b.start !== t1a.start && dur(t1b) === dur(t1a), `${t1a.start} → ${t1b.start}`)
await page.keyboard.press("Control+z")
await page.waitForTimeout(150)
await page.evaluate(() => window.__studio.getState().select([]))

// V11-6 duplo clique edita o rótulo sobre o bloco
await page.locator('#timeline-svg rect[data-hit=item][data-id=t1]').dblclick()
await page.waitForTimeout(150)
const inl = page.getByLabel("Rótulo curto do bloco")
await inl.fill("Técnico 1 (rótulo)")
await inl.press("Enter")
await page.waitForTimeout(200)
const label6 = await SV(() => window.__studio.getState().doc.items.find((i) => i.id === "t1").shortName)
ok("V11-6 duplo clique altera o rótulo", label6 === "Técnico 1 (rótulo)" && (await svgText(/Técnico 1 \(rótulo\)/)) >= 1, label6)
await page.keyboard.press("Control+z")
await page.waitForTimeout(150)
// context menu
await page.locator('#timeline-svg rect[data-hit=item][data-id=t2]').click({ button: "right" })
await page.waitForTimeout(150)
const menuOk = (await page.getByRole("menu").getByRole("menuitem").count()) >= 6
await page.keyboard.press("Escape")
ok("V11-6 menu contextual (duplicar, ocultar, bloquear, excluir, editar)", menuOk)

// V11-7 Design muda cor, fonte e contorno sem alterar dados administrativos
await page.evaluate(() => window.__studio.getState().select(["t1"]))
await page.waitForTimeout(200)
const t1before7 = await t1json()
const fins7 = await fins8()
await panel.getByRole("tab", { name: "Design" }).click()
await panel.getByRole("button", { name: "Estilo Contorno" }).click()
await panel.getByLabel("Fonte", { exact: true }).selectOption("serif")
await panel.getByLabel("Peso da fonte").selectOption("800")
await page.waitForTimeout(200)
const style7 = await SV(() => window.__studio.getState().doc.items.find((i) => i.id === "t1").style)
const t1after7 = JSON.parse(await t1json())
const t1b7 = JSON.parse(t1before7)
const rect7 = await SV(() => { const r = document.querySelector('#timeline-svg rect[data-hit=item][data-id=t1]'); return { fill: r.getAttribute("fill"), sw: r.getAttribute("stroke-width") } })
ok("V11-7 Design: aparência muda, datas/valores/vínculos não", style7?.font === "serif" && style7?.weight === 800 && style7?.fill === "#FFFFFF" && rect7.fill === "#FFFFFF" && rect7.sw === "2" &&
  t1after7.start === t1b7.start && t1after7.end === t1b7.end && JSON.stringify(t1after7.finance) === JSON.stringify(t1b7.finance) && JSON.stringify(t1after7.turmaIds) === JSON.stringify(t1b7.turmaIds) && (await fins8()) === fins7, JSON.stringify(style7))
await page.screenshot({ path: `${OUT}/v11-07-design.png` })

// V11-8 Dados: valores, datas e vínculos
await panel.getByRole("tab", { name: "Dados" }).click()
await panel.getByRole("button", { name: /Abrir aquisição e etapas/ }).click()
await page.waitForTimeout(200)
await panel.getByLabel("Valor contratado").fill("5000")
await panel.getByLabel("Valor contratado").blur()
await panel.getByLabel("Data de contratação").fill("2026-01-20")
await panel.getByLabel("Data de contratação").blur()
await page.waitForTimeout(200)
await page.evaluate(() => window.__studio.getState().select(["t1"]))
await page.waitForTimeout(150)
await panel.getByRole("tab", { name: "Dados" }).click()
await panel.getByRole("button", { name: "Adicionar projeto participante" }).click()
await page.waitForTimeout(150)
const d8 = await SV(() => { const d = window.__studio.getState().doc; const a = d.finRecords.find((f) => f.id === "fin-t1-aquisicao"); return { v: a.contractValue, dt: a.contractDate, fund: d.items.find((i) => i.id === "t1").funding } })
ok("V11-8 Dados: valor contratado, data e participação de projeto editados", d8.v === 5000 && d8.dt === "2026-01-20" && d8.fund?.length === 1, JSON.stringify(d8))
await page.keyboard.press("Control+z")
await page.waitForTimeout(150)
await panel.getByRole("tab", { name: "Conteúdo" }).click()
await page.evaluate(() => window.__studio.getState().select([]))

// V11-9 valores sob demanda (colunas à direita) e hover com período, turma, projeto, fonte
const finBefore = await page.getByRole("region", { name: "Resumo financeiro" }).count()
await page.getByRole("button", { name: "Valores", exact: true }).click()
await page.waitForTimeout(300)
const finRegion = page.getByRole("region", { name: "Resumo financeiro" })
const finTxt = (await finRegion.count()) ? await finRegion.innerText() : ""
await page.locator('#timeline-svg rect[data-hit=item][data-id=t1]').hover()
await page.waitForTimeout(300)
const hoverTxt = await page.locator("div.pointer-events-none.absolute.z-30.w-\\[290px\\]").first().innerText({ timeout: 3000 }).catch(() => "")
ok("V11-9 resumo financeiro sob demanda + hover com valores e fonte", finBefore === 0 && /Contratado/i.test(finTxt) && /R\$\s5\.000/.test(finTxt) && /Pago/i.test(finTxt) && hoverTxt.includes("Projeto") && hoverTxt.includes("Turma") && hoverTxt.includes("Fonte") && hoverTxt.includes("Contratado"), `${finTxt.replace(/\n/g, " ").slice(0, 80)} | hover: ${hoverTxt.replace(/\n/g, " ").slice(0, 160)}`)
await page.screenshot({ path: `${OUT}/v11-09-valores.png` })
await page.getByRole("button", { name: "Valores", exact: true }).click()

// V11-10 Explicar vigência: dois trilhos, mesma régua, etiqueta da execução posterior
await page.getByRole("button", { name: /Explicar vigência/ }).first().click()
await page.waitForTimeout(500)
const step1 = await page.locator("text=Etapa 1 de 7").count()
for (let i = 0; i < 3; i++) { await page.keyboard.press("ArrowRight"); await page.waitForTimeout(200) }
const tt11 = page.locator('svg[aria-label^="Dois tempos"]')
ok("V11-10 Explicar vigência: tempo do instrumento × tempo da formação", step1 === 1 && (await tt11.locator("text", { hasText: "TEMPO DO INSTRUMENTO" }).count()) === 1 && (await tt11.locator("text", { hasText: "TEMPO DA FORMAÇÃO" }).count()) === 1 &&
  (await page.locator("text=/Execução posterior à vigência — situação financeira a verificar/").count()) >= 1 && (await page.locator("text=/registrada como paga · comprovação pendente/").count()) >= 1)
await page.screenshot({ path: `${OUT}/v11-10-dois-tempos.png` })
await page.keyboard.press("Escape")

// V11-11 Projeto 3: quadro estratégico editável
await page.getByRole("tab", { name: /Projeto 3/ }).click()
await page.waitForTimeout(400)
const pillars = await page.locator('section[aria-label^="Pilar "]').count()
await page.locator('[data-idea="idea-automacao"]').dragTo(page.locator('section[aria-label="Pilar Formação e Continuidade"]'))
await page.waitForTimeout(250)
const pil = await SV(() => window.__studio.getState().doc.strategy.ideas.find((i) => i.id === "idea-automacao").pillar)
await page.locator('[data-idea="idea-formacao-em-ia"] button').first().click()
await page.getByLabel("Situação da proposta").selectOption("validada")
await page.waitForTimeout(150)
await page.getByRole("button", { name: /Adicionar ao cenário do Projeto 3/ }).click()
await page.waitForTimeout(250)
await page.getByLabel("Situação: Validação interna prevista").selectOption("realizado")
await page.waitForTimeout(150)
const p11 = await SV(() => { const d = window.__studio.getState().doc; return { added: d.scenarios.find((s) => s.id === d.strategy.scenarioId).added.map((i) => `${i.projectId}:${i.certainty}:${i.ideaId}`), base: d.items.length, ms: d.strategy.milestones[0].status, val: d.strategy.leadershipValidation.status } })
ok("V11-11 Projeto 3: arrastar entre pilares, editar, adicionar ao cenário, atualizar marco", pillars === 5 && pil === "formacao" && p11.added.length === 1 && p11.added[0] === "p3:planejado:idea-formacao-em-ia" && p11.base === base11.items && p11.ms === "realizado" && p11.val === "pendente", JSON.stringify({ pil, ...p11 }))
await page.screenshot({ path: `${OUT}/v11-11-projeto3.png` })
await page.getByRole("button", { name: "Modo reunião" }).click()
await page.waitForTimeout(250)
const meet = (await page.getByRole("dialog", { name: "Modo reunião" }).count()) === 1 && (await page.locator("text=/Presença e aprovação não presumidas/").count()) >= 1
await page.screenshot({ path: `${OUT}/v11-11b-reuniao.png` })
await page.getByRole("button", { name: "Encerrar reunião" }).click()
ok("V11-11 modo reunião com os pilares, sem presumir presença ou aprovação", meet)

// V11-12 Modo Diretoria: cinco cenas, sem elementos administrativos
await page.getByRole("button", { name: "Apresentar", exact: true }).click()
await page.waitForTimeout(800)
const titles = ["Evolução dos Projetos", "Jornada Educacional", "Dois Tempos", "Decisão de Continuidade", "Futuro do SKA Tech Hub"]
const seen = []
for (let i = 0; i < 5; i++) {
  await page.keyboard.press(String(i + 1))
  await page.waitForTimeout(1100)
  const eyebrow = await page.locator("text=/^0" + (i + 1) + "$/").count()
  seen.push(eyebrow >= 1 && (await page.locator("aside[aria-label=Propriedades]").count()) === 0)
  await page.screenshot({ path: `${OUT}/v11-12-cena${i + 1}.png` })
}
const sceneBtns = []
for (const t of titles) sceneBtns.push((await page.getByRole("button", { name: new RegExp(t) }).count()) >= 1)
await page.getByRole("button", { name: "Revelar pilar" }).click()
await page.waitForTimeout(300)
ok("V11-12 cinco cenas navegáveis com dados do sistema", seen.every(Boolean) && sceneBtns.every(Boolean) && (await page.locator("text=Formação em IA").count()) >= 0, JSON.stringify({ seen, sceneBtns }))

// V11-13 comparação de cenários preserva a linha de base
await page.keyboard.press("4")
await page.waitForTimeout(1100)
await page.locator('select[aria-label="Cenário apresentado"]').selectOption("alt-prorrogacao")
await page.waitForTimeout(500)
const cmp = await SV(() => ({ base: window.__studio.getState().doc.items.find((i) => i.id === "p2-vigencia").end, over: window.__studio.getState().doc.scenarios.find((s) => s.id === "alt-prorrogacao").overrides["p2-vigencia"]?.end }))
const cards13 = (await page.locator("text=/Cenário A — Prorrogação/").count()) >= 1 && (await page.locator("text=/Cenário B — Estruturação do Projeto 3/").count()) >= 1 && (await page.locator("text=/não substituem a linha de base/").count()) >= 1
ok("V11-13 prorrogação × Projeto 3 como hipóteses; base documental intacta", cmp.base === "2027-06-30" && cmp.over === "2027-12-31" && cards13 && (await page.locator("text=SIMULAÇÃO").count()) > 0, JSON.stringify(cmp))
await page.screenshot({ path: `${OUT}/v11-13-decisao.png` })
await page.locator('select[aria-label="Cenário apresentado"]').selectOption("baseline")
await page.keyboard.press("Escape")
await page.getByRole("button", { name: /Estúdio/ }).click().catch(() => {})
await page.waitForTimeout(300)

// V11-14 dados consistentes após a refatoração e após salvar/reabrir
await page.keyboard.press("Control+s")
await page.waitForTimeout(300)
await page.reload({ waitUntil: "networkidle" })
await page.waitForTimeout(700)
const after14 = await st11()
const keep14 = await SV(() => { const d = window.__studio.getState().doc; return { cv: d.finRecords.find((f) => f.id === "fin-t1-aquisicao").contractValue, style: d.items.find((i) => i.id === "t1").style?.font, pil: d.strategy.ideas.find((i) => i.id === "idea-automacao").pillar, added: d.scenarios.find((s) => s.id === d.strategy.scenarioId).added.length, v: d.settings.modelVersion, vig: d.items.find((i) => i.id === "p2-vigencia").end } })
ok("V11-14 registros, vínculos, estilo e Projeto 3 preservados após salvar e reabrir", after14.ids === base11.ids && after14.fins === base11.fins && after14.turmas === base11.turmas && keep14.cv === 5000 && keep14.style === "serif" && keep14.pil === "formacao" && keep14.added === 1 && keep14.v === 11 && keep14.vig === "2027-06-30", JSON.stringify(keep14))

ok("sem erros de página", errors.length === 0, errors.slice(0, 3).join(" | "))
await browser.close()
const failed = results.filter((r) => !r.pass)
console.log(`\n${results.length - failed.length}/${results.length} verificações aprovadas`)
process.exit(failed.length ? 1 : 0)
