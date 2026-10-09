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

ok("sem erros de página", errors.length === 0, errors.slice(0, 3).join(" | "))
await browser.close()
const failed = results.filter((r) => !r.pass)
console.log(`\n${results.length - failed.length}/${results.length} verificações aprovadas`)
process.exit(failed.length ? 1 : 0)
