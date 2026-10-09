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
ok("T5 continuidade (Técnico 1 após vigência)", await page.locator("#timeline-svg text", { hasText: "+6 m após vigência" }).count() >= 1)
await page.screenshot({ path: `${OUT}/01-studio.png` })

// T1 create a course
await page.getByTitle("Novo: Curso").click()
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
const overText = await page.locator("#timeline-svg text", { hasText: "após vigência" }).allTextContents()
ok("T4 sobreposição recalculada", !overText.some((t) => t.startsWith("+6 m")), overText.join(" | "))
await page.screenshot({ path: `${OUT}/02-scenario.png` })

// T6 presentation matches the active scenario
const expected = await page.evaluate(() => {
  const s = window.__studio.getState()
  const sc = s.doc.scenarios.find((x) => x.id === s.scenarioId)
  return { ...s.doc.items.find((i) => i.id === "p2-vigencia"), ...sc.overrides["p2-vigencia"] }.end.split("-").reverse().join("/")
})
await page.getByRole("button", { name: /Modo Diretoria/ }).click()
await page.waitForTimeout(900)
await page.keyboard.press("3")
await page.waitForTimeout(1200)
const kpi = await page.locator("text=Encerramento da vigência").locator("..").innerText()
ok("T6 Diretoria = cenário ativo", kpi.includes(expected) && (await page.locator("text=SIMULAÇÃO").count()) > 0, `${expected}`)
await page.screenshot({ path: `${OUT}/03-board-scenario.png` })

// back to baseline for the narrative
await page.locator('select[aria-label="Cenário apresentado"]').selectOption("baseline")
await page.waitForTimeout(500)

// T7 explain vigência
await page.getByRole("button", { name: /EXPLICAR VIGÊNCIA/ }).click()
for (let i = 0; i < 7; i++) {
  await page.keyboard.press("ArrowRight")
  await page.waitForTimeout(250)
}
await page.waitForTimeout(1000)
ok("T7 Explicar Vigência (8 etapas)", (await page.locator("text=Etapa 8 de 8").count()) === 1 && (await page.locator("text=Necessidades de análise e decisão").count()) === 1)
await page.screenshot({ path: `${OUT}/04-explain.png` })
await page.getByRole("button", { name: "Voltar" }).click()
ok("T7 reversível", (await page.locator("text=Etapa 7 de 8").count()) === 1)
await page.keyboard.press("Escape")

// T8 edit course in Studio → board updates
await page.getByRole("button", { name: /Estúdio/ }).click()
await page.waitForTimeout(300)
await page.evaluate(() => window.__studio.getState().select(["t1"]))
await page.waitForTimeout(200)
const endInput = page.locator("aside input[type=date]").nth(1)
await endInput.fill("2028-03-31")
await endInput.blur()
await page.waitForTimeout(200)
await page.getByRole("button", { name: /Modo Diretoria/ }).click()
await page.waitForTimeout(1300)
const t1kpi = await page.locator("text=Formação após a vigência").first().locator("..").innerText()
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
await page.getByRole("button", { name: "Fechar", exact: true }).last().click()
const json = JSON.parse(fs.readFileSync(file, "utf8"))
ok("T10 exportar JSON", json.schema === "ska-temporal-studio/1" && json.items.some((i) => i.name === "Curso E2E"))
await page.evaluate(() => window.__studio.getState().resetToSeed())
await page.getByRole("button", { name: "Exportar", exact: true }).click()
await page.locator("input[type=file]").setInputFiles(file)
await page.waitForTimeout(400)
const imported = await S()
ok("T10 importar JSON", imported.items.includes("Curso E2E") && imported.t1.end === "2028-03-31")

ok("sem erros de página", errors.length === 0, errors.slice(0, 3).join(" | "))
await browser.close()
const failed = results.filter((r) => !r.pass)
console.log(`\n${results.length - failed.length}/${results.length} verificações aprovadas`)
process.exit(failed.length ? 1 : 0)
