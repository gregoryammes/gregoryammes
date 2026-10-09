import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { ChevronLeft, ChevronRight, Eye, EyeOff, Sparkles, X as XIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { addMonths, calendarMonthsTouched, dayOf, fmtDate, fmtMonthsSpan, fromDay, monthShort, partAfter, toDay, ymd, type DayRange } from "@/lib/dates"
import { summarizeScenario, type EffItem } from "@/lib/analysis"
import { C, itemColor, statusOf, barStyleFor } from "@/lib/visual"
import { docVigRange, isDocumented, offeringLabel, shortNameOf, TEMPORAL_LABEL, temporalSituation } from "@/lib/v6"
import { FIN_LABEL, PARCEL_LABEL, type FinRecord, type TwoTimesCardId, type TwoTimesConfig } from "@/data/types"
import { acqOf, finRecordsIn, paidOf } from "@/lib/finance"
import { useStudio } from "@/store/store"
import { useView } from "@/store/view"
import { useEffectiveItems, useProjectColor } from "@/store/hooks"

/**
 * DOIS TEMPOS — "O prazo do projeto não é o prazo da formação".
 * One shared scale: a fixed name column (~25%) and the timeline (~75%).
 * Group 1 — planejamento e vigência (tempo do instrumento); group 2 — cursos e bolsas (tempo da
 * formação); group 3 — operação. A course is never cut at the vigência end: the part after it is
 * orange, on the same bar. Calendar continuity ≠ financial coverage.
 */

export const TWO_TIMES_STEPS = [
  "",
  "Tempo do instrumento — a vigência: o período formal de referência.",
  "O encerramento de referência: a linha que separa os dois tempos.",
  "Tempo da formação — os alunos seguem em formação conforme o calendário escolar.",
  "Execução posterior à vigência — situação financeira a verificar (não significa “sem cobertura”).",
  "As bolsas têm competências mensais próprias, pagas conforme frequência e unidades curriculares.",
  "Situação temporal e situação financeira são perguntas diferentes.",
  "E o próximo ciclo? Os cenários do Projeto 3 — todos hipóteses.",
]
const N = TWO_TIMES_STEPS.length - 1

type Group = 1 | 2 | 3
type RowKind = "plan" | "vig" | "course" | "bolsa" | "ops" | "other"
interface Row {
  key: string
  group: Group
  label: string
  sub?: string
  item: EffItem
  kind: RowKind
  stepShown: number
}

const GROUP_TITLE: Record<Group, [string, string]> = {
  1: ["PLANEJAMENTO E VIGÊNCIA", "TEMPO DO INSTRUMENTO"],
  2: ["FORMAÇÃO", "TEMPO DA FORMAÇÃO"],
  3: ["OPERAÇÃO", "EQUIPE E ESTRUTURA"],
}

const monthsBetween = (a: number, b: number) => {
  const x = ymd(a)
  const y = ymd(b)
  return (y.y - x.y) * 12 + (y.m - x.m)
}

export function TwoTimes({ size = "studio", projectId = "p2" }: { size?: "studio" | "stage"; projectId?: string }) {
  const doc = useStudio((s) => s.doc)
  const scenarioId = useStudio((s) => s.scenarioId)
  const items = useEffectiveItems()
  const colorOf = useProjectColor()
  const stage = size === "stage"
  const k = stage ? 1.1 : 1
  const wrap = useRef<HTMLDivElement>(null)
  const [W, setW] = useState(stage ? 1680 : 1100)
  const [step, setStep] = useState(0)
  const [zoom, setZoom] = useState<"semestres" | "meses">("semestres")
  const [scrollX, setScrollX] = useState(0)
  const explain = useView((s) => s.explain)
  const cfg: TwoTimesConfig = doc.presentation.twoTimes ?? {}
  const fins = useMemo(() => finRecordsIn(doc, scenarioId), [doc, scenarioId])

  // "Explicar vigência" from the timeline opens this view at the first step.
  useEffect(() => {
    if (stage || !explain) return
    setStep(explain)
    useView.getState().set({ explain: 0 })
  }, [explain, stage])

  useLayoutEffect(() => {
    if (stage || !wrap.current) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(760, Math.floor(e.contentRect.width) - 40)))
    ro.observe(wrap.current)
    return () => ro.disconnect()
  }, [stage])

  // Keys belong to the visible instance only: the Studio stays mounted (hidden) during the Board.
  const appMode = useStudio((s) => s.mode)
  const studioView = useView((s) => s.studioView)
  const active = stage ? appMode === "board" : appMode === "studio" && studioView === "twotimes"
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.isContentEditable || t.closest?.("input,select,textarea")) return
      if (step === 0) return
      // At the last step "next" goes on to the presentation (next scene) instead of being swallowed.
      if ((e.key === "ArrowRight" || e.key === " ") && step === N) return
      if (e.key === "ArrowRight" || e.key === " ") setStep((s) => Math.min(N, s + 1))
      else if (e.key === "ArrowLeft") setStep((s) => Math.max(0, s - 1))
      else if (e.key === "Escape") setStep(0)
      else return
      e.preventDefault()
      e.stopImmediatePropagation()
    }
    window.addEventListener("keydown", onKey, { capture: true })
    return () => window.removeEventListener("keydown", onKey, { capture: true })
  }, [step, active])

  const mine = items.filter((i) => i.projectId === projectId && !i.hidden)
  const project = doc.projects.find((p) => p.id === projectId)
  const vigEff = mine.find((i) => i.kind === "vigencia")
  const vigRec = doc.items.find((i) => i.kind === "vigencia" && i.projectId === projectId)
  const docVig = docVigRange(doc, projectId)
  const hypVig: DayRange | null = vigEff && docVig && vigEff.range.end !== docVig.end ? vigEff.range : null
  const plan = mine.find((i) => i.kind === "planejamento" && !/operacional/i.test(i.name)) ?? mine.find((i) => i.kind === "planejamento")
  const marcos = mine.filter((i) => i.kind === "marco")
  const courses = mine.filter((i) => i.kind === "curso").sort((a, b) => a.range.start - b.range.start)
  const mainCourse = courses.find((c) => c.certainty !== "hipotese" && !c.dateUndetermined) ?? courses[0]
  const ops = mine.filter((i) => i.kind === "operacao")
  const others = cfg.showOthers && !stage ? mine.filter((i) => (i.kind === "atividade" || i.kind === "bolsa") && !i.parentId).sort((a, b) => a.range.start - b.range.start) : []
  const p3 = items.find((i) => i.kind === "projeto" && i.projectId === "p3")
  const ref = toDay(doc.settings.referenceDate)
  // "Documental" only when the record says so (comprovado / formalizado / executado) — never by default.
  const vigDocumented = isDocumented(vigRec?.certainty) && (!vigRec?.contractStatus || isDocumented(vigRec.contractStatus))
  const vigNature = vigDocumented ? "referência documental" : "referência operacional · conciliação documental pendente"
  const vigSub = vigDocumented ? "documental" : vigRec?.certainty === "nao_confirmado" ? "não confirmada" : "data operacional, a validar"

  const rows: Row[] = [
    ...(plan ? [{ key: plan.id, group: 1 as Group, label: "Planejamento original", sub: `${fmtDate(plan.start, "month")} – ${fmtDate(plan.end, "month")}`, item: plan, kind: "plan" as RowKind, stepShown: 1 }] : []),
    ...(vigEff ? [{ key: vigEff.id, group: 1 as Group, label: "Vigência de referência", sub: `${project?.short ?? project?.name ?? ""} · ${vigSub}`, item: vigEff, kind: "vig" as RowKind, stepShown: 1 }] : []),
    ...courses.flatMap((c): Row[] => {
      const bolsas = mine.filter((b) => b.kind === "bolsa" && !b.consolidation && b.parentId === c.id)
      const planned = c.certainty === "hipotese" || !!c.dateUndetermined
      const turma = offeringLabel(doc, c, false).split(" · ").slice(1).join(" · ")
      return [
        { key: c.id, group: 2, label: `${shortNameOf(c)}${planned ? " — planejamento" : ""}`, sub: turma, item: c, kind: "course", stepShown: c === mainCourse ? 3 : 5 },
        ...bolsas.map((b): Row => ({ key: b.id, group: 2, label: `Bolsas · ${shortNameOf(c)}`, sub: b.certainty === "hipotese" || b.dateUndetermined ? "previsão" : "competências mensais", item: b, kind: "bolsa", stepShown: 5 })),
      ]
    }),
    ...others.map((o): Row => ({ key: o.id, group: 2, label: shortNameOf(o), sub: o.kind === "bolsa" ? "bolsas · outra atividade" : "outra atividade", item: o, kind: "other", stepShown: 5 })),
    ...ops.map((o): Row => ({ key: o.id, group: 3, label: shortNameOf(o), sub: "equipe, estrutura e serviços", item: o, kind: "ops", stepShown: 6 })),
  ]

  // Shared scale: whole years covering everything shown.
  const allRanges = [docVig, hypVig, ...rows.map((r) => r.item.range), step >= 7 && p3 ? p3.range : null].filter((x): x is DayRange => !!x)
  const d0 = dayOf(ymd(Math.min(...allRanges.map((r) => r.start))).y, 1)
  const lastYear = dayOf(ymd(Math.max(...allRanges.map((r) => r.end)) - 1).y + 1, 1)
  // Keep at least a year after the documental end so the labels anchored there are never cut.
  const d1 = docVig && lastYear - docVig.end < 365 ? dayOf(ymd(lastYear).y + 1, 1) : lastYear
  const nMonths = monthsBetween(d0, d1)
  const baseW = stage ? 1680 : W
  const LABEL = Math.max(stage ? 400 : 290, Math.round(baseW * 0.25))
  const plotW = Math.max(baseW - LABEL - 8, zoom === "meses" && !stage ? nMonths * 36 : 0)
  const SVGW = LABEL + plotW + 8
  const X = (d: number) => LABEL + ((d - d0) / (d1 - d0)) * plotW
  const showMonthNames = plotW / nMonths >= 26

  const AXH = 64 * k
  const tight = stage && step > 0
  const GROUP_H = (stage ? (tight ? 22 : 26) : 28) * k
  const ROW = (stage ? (tight ? 36 : 42) : 56) * k
  const BAR = (stage ? (tight ? 20 : 24) : 22) * k
  const groupsShown = ([1, 2, 3] as Group[]).filter((g) => rows.some((r) => r.group === g))
  const rowY = new Map<string, number>()
  const groupY = new Map<Group, number>()
  let yc = AXH + 10 * k
  for (const g of groupsShown) {
    groupY.set(g, yc)
    yc += GROUP_H
    for (const r of rows.filter((x) => x.group === g)) {
      rowY.set(r.key, yc)
      yc += ROW
    }
    yc += 8 * k
  }
  const bodyTop = AXH + 6 * k
  const bodyBottom = yc
  const refLow = !!docVig && ref > docVig.end
  const H = yc + (hypVig ? 52 : 38) * k + (refLow ? 14 * k : 0)

  const course = mainCourse
  const courseAfter = course && docVig && !course.dateUndetermined ? partAfter(course.range, docVig) : null
  const courseMonths = calendarMonthsTouched(courseAfter)
  const lastCourseEnd = courses.filter((c) => !c.dateUndetermined && c.certainty !== "hipotese" && docVig && c.range.start < docVig.end && c.range.end > docVig.end).reduce((m, c) => Math.max(m, c.range.end), 0)
  const shown = (r: Row) => step === 0 || step >= r.stepShown
  const groupDim = (g: Group) => ((step === 1 || step === 2) && g !== 1) || ((step === 3 || step === 4) && g === 3) ? 0.2 : 1
  const summaries = useMemo(() => doc.scenarios.map((s) => summarizeScenario(doc, s.id, mainCourse?.id ?? "t1")), [doc, mainCourse?.id])
  const fs = (n: number) => n * k
  const ticks: { day: number; m: number; y: number }[] = []
  for (let d = d0; d < d1; d = addMonths(d, 1)) ticks.push({ day: d, ...ymd(d) })
  const years = [...new Set(ticks.map((t) => t.y))]
  const lag = plan && vigEff ? monthsBetween(plan.range.start, vigEff.range.start) : 0
  const situationVisible = !stage || step === 6

  return (
    <div ref={wrap} className={cn("flex h-full flex-col bg-white", stage ? "relative" : "overflow-auto")}>
      <div className={cn("flex flex-wrap items-start gap-3", stage ? "absolute -top-[78px] right-0" : "border-b px-5 py-3")}>
        {!stage && (
          <div className="min-w-0">
            <h2 className="font-display text-[19px] leading-tight font-bold text-[#162A40]">O prazo do projeto não é o prazo da formação</h2>
            <p className="mt-0.5 text-[12px] text-muted-foreground">A execução pedagógica pode continuar após o encerramento da vigência do instrumento. Dois Tempos · uma única régua, os mesmos registros.</p>
          </div>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {!stage && (
            <>
              <div role="group" aria-label="Escala dos Dois Tempos" className="flex rounded-md border bg-muted p-0.5 text-xs">
                {(["semestres", "meses"] as const).map((z) => (
                  <button key={z} aria-pressed={zoom === z} onClick={() => setZoom(z)} className={cn("rounded px-2 py-1 font-semibold", zoom === z ? "bg-white text-foreground shadow-sm" : "text-muted-foreground")}>
                    {z === "semestres" ? "Semestres" : "Meses"}
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={!!cfg.showOthers}
                  onChange={() => useStudio.getState().commit("Dois Tempos · outras atividades", (d) => ({ ...d, presentation: { ...d.presentation, twoTimes: { ...(d.presentation.twoTimes ?? {}), showOthers: !cfg.showOthers } } }))}
                />
                Outras atividades
              </label>
            </>
          )}
          {step === 0 ? (
            <Button variant="accent" className={stage ? "h-14 px-6 text-[20px] font-bold" : ""} onClick={() => setStep(1)}>
              <Sparkles className={stage ? "size-6" : "size-4"} /> {stage ? "EXPLICAR VIGÊNCIA" : "Explicar vigência"}
            </Button>
          ) : (
            <div className={cn("flex items-center gap-2 rounded-lg border bg-white px-2 py-1", stage && "px-3 py-2")}>
              <span className={cn("font-semibold text-navy", stage ? "text-[18px]" : "text-xs")}>Etapa {step} de {N}</span>
              <Button size={stage ? "md" : "sm"} onClick={() => setStep(Math.max(0, step - 1))}><ChevronLeft className="size-4" /> Voltar</Button>
              <Button size={stage ? "md" : "sm"} variant="accent" disabled={step === N} onClick={() => setStep(step + 1)}>Avançar <ChevronRight className="size-4" /></Button>
              <button aria-label="Encerrar explicação" className="rounded p-1 text-muted-foreground hover:bg-muted" onClick={() => setStep(0)}><XIcon className="size-4" /></button>
            </div>
          )}
        </div>
      </div>

      <div className={cn(!stage && "px-5 py-3")}>
        {step > 0 && (
          <div className={cn("mb-3 rounded-lg border bg-[#F7F9FC] font-semibold text-foreground", stage ? "mb-2 px-4 py-2 text-[20px]" : "px-3 py-2 text-[13px]")} role="status">
            {TWO_TIMES_STEPS[step]}
            {step === 4 && courseAfter && <span className="text-[#9A4A08]"> {courseMonths} meses-calendário: {fmtMonthsSpan(courseAfter)}.</span>}
          </div>
        )}
        <div className={cn(!stage && "overflow-x-auto")} onScroll={(e) => setScrollX((e.target as HTMLDivElement).scrollLeft)}>
          <svg width={SVGW} height={H} role="img" aria-label="Dois tempos do projeto: vigência e formação na mesma régua" style={{ fontFamily: "Inter, system-ui, sans-serif", display: "block" }}>
            <defs>
              <pattern id={`tt-after-${size}`} patternUnits="userSpaceOnUse" width={8 * k} height={8 * k} patternTransform="rotate(45)">
                <rect width={8 * k} height={8 * k} fill={C.after} />
                <line x1="0" y1="0" x2="0" y2={8 * k} stroke="#fff" strokeWidth={2 * k} strokeOpacity="0.3" />
              </pattern>
            </defs>

            {/* Ruler: years · semesters · months (letters, or names when there is room) */}
            {years.map((y) => {
              const a = Math.max(d0, dayOf(y, 1))
              const b = Math.min(d1, dayOf(y + 1, 1))
              return (
                <g key={y}>
                  <rect x={X(a) + 1} y={0} width={X(b) - X(a) - 2} height={26 * k} fill="#E6EBF1" />
                  <text x={(X(a) + X(b)) / 2} y={18 * k} fontSize={fs(14)} fontWeight={800} fill={C.text} textAnchor="middle">{y}</text>
                  {[0, 1].map((h) => (
                    <g key={h}>
                      <rect x={X(dayOf(y, h * 6 + 1)) + 1} y={28 * k} width={X(dayOf(y, h * 6 + 7)) - X(dayOf(y, h * 6 + 1)) - 2} height={16 * k} fill="#F1F4F8" />
                      <text x={(X(dayOf(y, h * 6 + 1)) + X(dayOf(y, h * 6 + 7))) / 2} y={40 * k} fontSize={fs(10.5)} fontWeight={600} fill={C.text2} textAnchor="middle">{h + 1}º sem</text>
                    </g>
                  ))}
                </g>
              )
            })}
            {ticks.map((t) => (
              <text key={t.day} x={(X(t.day) + X(addMonths(t.day, 1))) / 2} y={57 * k} fontSize={fs(showMonthNames ? 9.5 : 9)} fontFamily="JetBrains Mono, monospace" textAnchor="middle"
                fill={docVig && t.day === docVig.end ? C.vigLine : C.text3} fontWeight={docVig && t.day === docVig.end ? 800 : 500}>
                {showMonthNames ? monthShort(t.m) : monthShort(t.m)[0].toUpperCase()}
              </text>
            ))}

            {/* Light orange region after the documental end — temporal attention, not a financial verdict */}
            {docVig && <rect x={X(docVig.end)} y={bodyTop} width={Math.max(0, X(d1) - X(docVig.end))} height={bodyBottom - bodyTop} fill={C.afterSoft} />}

            {/* Group bands (they span the name column and the plot) */}
            {groupsShown.map((g) => {
              const y = groupY.get(g)!
              return (
                <g key={`g${g}`} opacity={groupDim(g)} style={{ transition: "opacity 300ms" }}>
                  <rect x={0} y={y} width={SVGW} height={GROUP_H - 4 * k} fill="#F1F4F8" fillOpacity={0.9} />
                  <text x={LABEL + 10} y={y + GROUP_H / 2 + 2 * k} fontSize={fs(9.5)} fontWeight={700} letterSpacing={1.1} fill={C.text3}>{GROUP_TITLE[g][1]}</text>
                </g>
              )
            })}
            {years.map((y) => <line key={`gy${y}`} x1={X(dayOf(y, 1))} x2={X(dayOf(y, 1))} y1={bodyTop} y2={bodyBottom} stroke={C.grid} />)}
            {zoom === "meses" && ticks.map((t) => <line key={`gm${t.day}`} x1={X(t.day)} x2={X(t.day)} y1={bodyTop} y2={bodyBottom} stroke={C.gridSoft} />)}

            {rows.map((r) => {
              const y = rowY.get(r.key)!
              const isMain = r.item === course
              const fade = groupDim(r.group) < 1 ? 0.2 : !shown(r) ? 0.08 : (step === 3 || step === 4) && r.group === 2 && !isMain ? 0.3 : 1
              const by = y + (ROW - BAR) / 2 + (r.kind === "course" || r.kind === "bolsa" ? 4 * k : 0)
              const it = r.item
              return (
                <g key={r.key} opacity={fade} style={{ transition: "opacity 300ms" }}>
                  <line x1={0} x2={SVGW} y1={y + ROW} y2={y + ROW} stroke={C.gridSoft} />
                  <g style={{ cursor: stage ? "default" : "pointer" }} onClick={() => !stage && useStudio.getState().select([it.id])}>
                    {r.kind === "bolsa" ? (
                      <BolsaMonths it={it} y={by} h={BAR} X={X} docVig={docVig} fins={fins} k={k} showAfter={step === 0 || step >= 5} color={itemColor(it.kind, colorOf(it.projectId), it.color)} ref_={ref} turma={r.sub ?? ""} />
                    ) : (
                      <Bar it={it} r={r} y={by} h={BAR} X={X} docVig={docVig} k={k} step={step} size={size} ref_={ref} color={r.kind === "vig" ? colorOf(projectId) : itemColor(it.kind, colorOf(it.projectId), it.color)} lastCourseEnd={lastCourseEnd} />
                    )}
                    {(step === 3 || step === 4) && isMain && (
                      <rect x={X(it.range.start) - 4} y={by - 4} width={X(it.range.end) - X(it.range.start) + 8} height={BAR + 8} rx={5} fill="none" stroke={C.blue} strokeWidth={2.5} />
                    )}
                  </g>
                  {/* Delay between the original plan and the vigência start */}
                  {r.kind === "vig" && plan && lag > 0 && (
                    <g>
                      <path d={`M${X(plan.range.start)},${by - 2 * k} v${-6 * k} H${X(it.range.start)} v${6 * k}`} fill="none" stroke={C.text2} strokeWidth={1.3} strokeDasharray="3 2" />
                      <text x={X(plan.range.start) + 4} y={by - 11 * k} fontSize={fs(10)} fontWeight={700} fill={C.text2}>início {lag} meses após o planejado</text>
                    </g>
                  )}
                  {r.kind === "vig" && marcos.map((m) => (
                    <g key={m.id}>
                      <path d={`M${X(m.range.start)},${by + BAR / 2 - 7 * k} l${7 * k},${7 * k} l${-7 * k},${7 * k} l${-7 * k},${-7 * k} Z`} fill="#fff" stroke={C.navy} strokeWidth={2} />
                      <title>{`${fmtDate(m.start)} · ${m.name} (natureza a conciliar)`}</title>
                    </g>
                  ))}
                  {r.kind === "vig" && docVig && hypVig && (
                    <g>
                      <rect x={X(Math.min(docVig.end, hypVig.end))} y={by} width={Math.abs(X(hypVig.end) - X(docVig.end))} height={BAR} rx={4} fill="#fff" fillOpacity={hypVig.end < docVig.end ? 0.6 : 1} stroke={C.scenario} strokeWidth={2} strokeDasharray="7 5" />
                      <text x={X(Math.min(docVig.end, hypVig.end)) + 8 * k} y={by + BAR / 2 + 4 * k} fontSize={fs(11)} fontWeight={700} fill={C.scenario}>
                        {hypVig.end < docVig.end ? `cenário: encerramento antecipado em ${fmtDate(fromDay(hypVig.end - 1))}` : `cenário: até ${fmtDate(fromDay(hypVig.end - 1))}`}
                      </text>
                    </g>
                  )}
                  {r.kind === "vig" && step >= 7 && p3 && (
                    <g>
                      <rect x={X(p3.range.start)} y={by + BAR + 3 * k} width={Math.max(0, Math.min(X(d1), X(p3.range.end)) - X(p3.range.start))} height={11 * k} rx={3} fill="#fff" stroke={colorOf("p3")} strokeWidth={2} strokeDasharray="6 4" />
                      <text x={X(p3.range.start) + 8} y={by + BAR + 12 * k} fontSize={fs(9.5)} fontWeight={700} fill={colorOf("p3")}>Projeto 3 · em modelagem · a partir de {fmtDate(p3.start, "month")}</text>
                    </g>
                  )}
                </g>
              )
            })}

            {/* Step 4: bracket over the course's remaining part */}
            {step === 4 && courseAfter && course && rowY.has(course.id) && (
              <g>
                <path d={`M${X(courseAfter.start)},${rowY.get(course.id)! + 10 * k} v${-6 * k} H${X(courseAfter.end)} v${6 * k}`} stroke={C.afterText} strokeWidth={2.5} fill="none" />
                <text x={X(courseAfter.start)} y={rowY.get(course.id)! + 1 * k} fontSize={fs(12)} fontWeight={800} fill={C.afterText}>{courseMonths} meses-calendário após o encerramento</text>
              </g>
            )}

            {/* Reference date and the documental / hypothetical ends — the marker crosses the whole calendar */}
            <line x1={X(ref)} x2={X(ref)} y1={bodyTop} y2={bodyBottom} stroke="#5FA548" strokeWidth={2 * k} />
            {hypVig && <line x1={X(hypVig.end)} x2={X(hypVig.end)} y1={bodyTop} y2={bodyBottom + 34 * k} stroke={C.scenario} strokeWidth={1.8 * k} strokeDasharray="7 5" />}
            {docVig && <line x1={X(docVig.end)} x2={X(docVig.end)} y1={44 * k} y2={bodyBottom + 14 * k} stroke={C.vigLine} strokeWidth={(step === 2 ? 4.5 : 2.4) * k} style={{ transition: "stroke-width 250ms" }} />}
            {step === 2 && docVig && (
              <g>
                <rect x={X(docVig.end) - 110 * k} y={bodyTop + 6 * k} width={220 * k} height={28 * k} rx={6} fill={C.vigLine} />
                <text x={X(docVig.end)} y={bodyTop + 25 * k} fontSize={fs(15)} fontWeight={800} fill="#fff" textAnchor="middle">{fmtDate(fromDay(docVig.end - 1))}</text>
              </g>
            )}
            <g fontSize={fs(11.5)} fontWeight={700}>
              {docVig && (
                <text x={X(docVig.end) + 6} y={bodyBottom + 14 * k} fill={C.vigLine}>
                  ↑ {fmtDate(fromDay(docVig.end - 1))} · encerramento da vigência de referência
                  <tspan x={X(docVig.end) + 6} dy={14 * k} fontSize={fs(10.5)} fontWeight={500}>{vigNature}</tspan>
                </text>
              )}
              {hypVig && <text x={X(hypVig.end) + 6} y={bodyBottom + 44 * k} fill={C.scenario}>┆ {fmtDate(fromDay(hypVig.end - 1))} · hipótese de cenário</text>}
              <text x={X(ref) - 6} y={bodyBottom + (refLow ? (hypVig ? 58 : 44) : 14) * k} fill="#3E7D2C" textAnchor="end">referência {fmtDate(doc.settings.referenceDate)}</text>
            </g>

            {/* Name column (~25%), frozen while the months scale scrolls horizontally */}
            <g transform={`translate(${scrollX},0)`}>
              <rect x={0} y={0} width={LABEL} height={H} fill="#fff" />
              {groupsShown.map((g) => {
                const y = groupY.get(g)!
                return (
                  <g key={`gl${g}`} opacity={groupDim(g)} style={{ transition: "opacity 300ms" }}>
                    <rect x={0} y={y} width={LABEL} height={GROUP_H - 4 * k} fill="#F1F4F8" />
                    <text x={14} y={y + GROUP_H / 2 + 2 * k} fontSize={fs(11)} fontWeight={800} letterSpacing={1.3} fill={g === 1 ? C.navy : g === 2 ? C.blue : "#6B5B4E"}>{GROUP_TITLE[g][0]}</text>
                  </g>
                )
              })}
              {rows.map((r) => {
                const y = rowY.get(r.key)!
                const fade = groupDim(r.group) < 1 ? 0.2 : !shown(r) ? 0.08 : (step === 3 || step === 4) && r.group === 2 && r.item !== course ? 0.3 : 1
                return (
                  <g key={`l${r.key}`} opacity={fade} style={{ transition: "opacity 300ms" }}>
                    {situationVisible && r.group !== 1 ? (
                      <foreignObject x={10} y={y + 2} width={LABEL - 22} height={ROW - 4}>
                        <div className={cn("flex h-full flex-col justify-center leading-tight", stage ? "text-[14px]" : "text-[12px]")}>
                          <div className="truncate" title={`${r.label}${r.sub ? ` · ${r.sub}` : ""}`}>
                            <span className="font-bold text-[#162A40]">{r.label}</span>
                            {r.sub && <span className="text-muted-foreground"> · {r.sub}</span>}
                          </div>
                          <SituationPair item={r.item} docVig={docVig} stage={stage} fins={fins} />
                        </div>
                      </foreignObject>
                    ) : (
                      <text fontSize={fs(12.5)} fill={C.text}>
                        <tspan x={14} y={y + ROW / 2 - 3 * k} fontWeight={700}>{r.label}</tspan>
                        {r.sub && <tspan x={14} y={y + ROW / 2 + 12 * k} fontSize={fs(10.5)} fill={C.text2}>{r.sub}</tspan>}
                      </text>
                    )}
                    <line x1={0} x2={LABEL} y1={y + ROW} y2={y + ROW} stroke={C.gridSoft} />
                  </g>
                )
              })}
              <line x1={LABEL - 1} x2={LABEL - 1} y1={bodyTop} y2={bodyBottom} stroke={C.grid} />
            </g>
          </svg>
        </div>

        {(step === 0 || step === 6) && <SummaryCards stage={stage} cfg={cfg} courses={courses} items={mine} fins={fins} docVig={docVig} />}
        {step === 7 && (
          <div className={cn("mt-3 grid gap-2", stage ? "grid-cols-3" : "grid-cols-1 md:grid-cols-3")}>
            {summaries.map((s) => (
              <button
                key={s.scenario.id}
                onClick={() => useStudio.getState().setScenario(s.scenario.id)}
                className={cn("rounded-lg border-2 p-3 text-left", s.scenario.id === scenarioId ? "border-primary bg-[#F2F8FC]" : "hover:border-[#B6C2D0]", stage ? "text-[17px]" : "text-[12px]")}
              >
                <div className="font-bold text-foreground">{s.scenario.name}</div>
                <div className="text-muted-foreground">Vigência até {s.vigEnd != null ? fmtDate(fromDay(s.vigEnd - 1)) : "—"}{s.scenario.kind !== "baseline" && s.vigEnd !== docVig?.end ? " (hipótese)" : ""}</div>
                <div className={s.t1After ? "font-semibold text-[#9A4A08]" : "text-muted-foreground"}>{s.t1After ? `${mainCourse ? shortNameOf(mainCourse) : "Curso"}: ${s.t1After.months} m após` : "Curso dentro da vigência"}</div>
                <div className="text-muted-foreground">P3 a partir de {s.p3 ? fmtDate(s.p3.start, "month") : "—"} · não aprovado</div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function Bar({ it, r, y, h, X, docVig, k, step, size, ref_, color, lastCourseEnd }: {
  it: EffItem; r: Row; y: number; h: number; X: (d: number) => number; docVig: DayRange | null; k: number; step: number; size: string; ref_: number; color: string; lastCourseEnd: number
}) {
  const st = statusOf(it, ref_)
  const plan = r.kind === "plan"
  const vig = r.kind === "vig"
  const approx = !!it.dateUndetermined
  // The vigência bar is the documental one; a scenario extension is drawn separately (dashed).
  const range = vig ? (it.baseRange ?? it.range) : it.range
  const x1 = X(range.start)
  const x2 = X(range.end)
  const bs = plan
    ? { fill: C.plan, fillOpacity: 0.4, stroke: "#8EA0B4", strokeWidth: 1, dash: undefined as string | undefined, text: C.text }
    : vig
      ? { fill: color, fillOpacity: 1, stroke: color, strokeWidth: 1, dash: undefined, text: "#fff" }
      : barStyleFor(st.key, color)
  const after = docVig && !vig && !plan && !approx && (step === 0 || step >= 4) ? partAfter(range, docVig) : null
  const scenarioLook = st.key === "cenario" || st.key === "planejado" || approx
  const fmt = (iso: string) => fmtDate(iso, it.precision === "year" ? "year" : "month")
  const label = `${approx ? "≈ " : ""}${fmt(it.start)} – ${fmt(it.end)}${approx ? " · período previsto, datas a definir" : ""}`
  const vigLabel = `${fmtDate(fromDay(range.start), "month")} – ${fmtDate(fromDay(range.end - 1), "month")}`
  return (
    <g>
      <rect x={x1} y={y} width={Math.max(3, x2 - x1)} height={h} rx={4 * k} fill={scenarioLook && !plan && !vig ? "#fff" : bs.fill} fillOpacity={scenarioLook && !plan && !vig ? 1 : bs.fillOpacity}
        stroke={scenarioLook && !plan && !vig ? color : bs.stroke} strokeWidth={Math.max(1, scenarioLook && !plan && !vig ? 1.6 : bs.strokeWidth)} strokeDasharray={scenarioLook && !plan && !vig ? "6 4" : bs.dash} />
      {after && (
        <rect x={X(after.start)} y={y} width={Math.max(3, X(after.end) - X(after.start))} height={h} rx={4 * k}
          fill={scenarioLook ? "#fff" : `url(#tt-after-${size})`} stroke={C.after} strokeWidth={scenarioLook ? 1.5 : 0} strokeDasharray={scenarioLook ? "6 4" : undefined} />
      )}
      {x2 - x1 > 100 * k && (
        <text x={x1 + 9 * k} y={y + h / 2 + 4 * k} fontSize={11 * k} fontWeight={600} fill={scenarioLook && !plan && !vig ? C.text : bs.text}>{vig ? vigLabel : label}</text>
      )}
      {after && r.kind === "course" && step !== 4 && X(after.end) - X(after.start) > 70 * k && (
        <text x={X(after.start) + 6 * k} y={y - 5 * k} fontSize={10.5 * k} fontWeight={700} fill={C.afterText}>
          {scenarioLook ? "Período previsto após a vigência — hipótese" : "Execução posterior à vigência — situação financeira a verificar"}
        </text>
      )}
      {/* Operation: the record ends with the vigência; what continues with the courses is "a analisar" (visual only). */}
      {r.kind === "ops" && docVig && lastCourseEnd > docVig.end && range.end <= docVig.end + 31 && (
        <g>
          <rect x={X(docVig.end)} y={y + 2} width={Math.max(0, X(lastCourseEnd) - X(docVig.end))} height={h - 4} rx={4 * k} fill="none" stroke={C.after} strokeWidth={1.6} strokeDasharray="5 4" />
          {X(lastCourseEnd) - X(docVig.end) > 44 * k && (
            <text x={X(docVig.end) + 8 * k} y={y + h / 2 + 4 * k} fontSize={10.5 * k} fontWeight={700} fill={C.afterText}>{X(lastCourseEnd) - X(docVig.end) > 140 * k ? "continuidade a analisar" : "a analisar"}</text>
          )}
          <title>Equipe e operação após a vigência: situação a analisar (não registrada como compromisso).</title>
        </g>
      )}
      <title>{`${it.name} · ${fmtDate(it.start)} – ${fmtDate(it.end)}${approx ? " (datas a definir)" : ""}`}</title>
    </g>
  )
}

/** Bolsas: one cell per competência (month). The state comes only from installment records — never presumed. */
function BolsaMonths({ it, y, h, X, docVig, fins, k, showAfter, color, ref_, turma }: {
  it: EffItem; y: number; h: number; X: (d: number) => number; docVig: DayRange | null; fins: FinRecord[]; k: number; showAfter: boolean; color: string; ref_: number; turma: string
}) {
  const byComp = new Map<string, FinRecord>()
  for (const p of fins) {
    if (p.kind !== "parcela" || p.actionId !== it.id) continue
    const c = p.competencia ?? p.start?.slice(0, 7)
    if (c) byComp.set(c, p)
  }
  const forecast = it.certainty === "hipotese" || it.certainty === "planejado" || !!it.dateUndetermined
  const money = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
  const first = ymd(it.range.start)
  const cells: React.ReactNode[] = []
  for (let d = dayOf(first.y, first.m); d < it.range.end; d = addMonths(d, 1)) {
    const t = ymd(d)
    const comp = `${t.y}-${String(t.m).padStart(2, "0")}`
    const a = Math.max(d, it.range.start)
    const b = Math.min(addMonths(d, 1), it.range.end)
    // Any part of the competência after the documental end counts — the same rule as the label.
    const after = !!docVig && b > docVig.end
    const p = byComp.get(comp)
    const status = p?.parcelStatus
    const pred = forecast || status === "prevista"
    const fill = status === "paga" ? C.paid : status === "pendente" ? "#FFF4D6" : status === "devida" || pred ? "#FFFFFF" : color
    const stroke = status === "devida" ? C.after : status === "pendente" ? C.amber : pred ? color : showAfter && after ? C.after : "none"
    cells.push(
      <rect key={comp} data-competencia={comp} data-after={after ? "1" : "0"} x={X(a) + 0.6} y={y} width={Math.max(1, X(b) - X(a) - 1.2)} height={h} rx={2}
        fill={showAfter && after && !status && !pred ? C.after : fill} fillOpacity={status ? 1 : pred ? 1 : showAfter && after ? 0.45 : 0.5}
        stroke={stroke} strokeWidth={stroke === "none" ? 0 : 1.2} strokeDasharray={pred && !status ? "2 2" : undefined}>
        <title>{[
          `Competência ${monthShort(t.m)}/${t.y} · ${turma || it.name}`,
          status ? PARCEL_LABEL[status] : pred ? "Competência prevista" : "Sem registro de parcela",
          p?.beneficiaries != null ? `${p.beneficiaries} beneficiários` : "Beneficiários elegíveis: não informado",
          p?.value != null ? `Valor: ${money(p.value)}` : "Valor: não informado",
          after ? "Após a vigência de referência — cobertura a validar" : "Dentro da vigência de referência",
          d < ref_ && !status && !pred ? "Competência passada sem registro: não é considerada paga" : "",
        ].filter(Boolean).join("\n")}</title>
      </rect>,
    )
  }
  const afterMonths = docVig && !forecast ? calendarMonthsTouched(partAfter(it.range, docVig)) : 0 // = cells flagged above
  return (
    <g data-bolsa-months={it.id}>
      {cells}
      {showAfter && afterMonths > 0 && docVig && (
        <text x={X(Math.max(docVig.end, it.range.start)) + 6 * k} y={y - 4 * k} fontSize={10 * k} fontWeight={700} fill={C.afterText}>
          {afterMonths} competências após a vigência — cobertura a validar
        </text>
      )}
      {forecast && X(it.range.end) - X(it.range.start) > 120 * k && (
        <text x={X(it.range.start) + 2 * k} y={y - 4 * k} fontSize={10 * k} fontWeight={600} fill={C.text2}>previsão de competências mensais · a validar</text>
      )}
    </g>
  )
}

/** Financial line of a row: the acquisition record when there is one, otherwise the registered situation. */
function finLine(it: EffItem, fins: FinRecord[]) {
  const acq = acqOf(fins, it.id)
  if (acq) {
    const st = acq.acqStatus ?? "planejado"
    if (st === "integralmente_pago") return acq.proof === "comprovado" ? "Aquisição integralmente paga e comprovada" : "Aquisição registrada como paga · comprovação pendente"
    if (st === "cotacao") return "Cotação recebida · contratação pendente"
    if (st === "em_negociacao") return "Aquisição: negociação · compra a formalizar"
    if (st === "contratado") return "Aquisição: contratada"
    if (st === "parcialmente_pago") return "Aquisição: parcialmente paga"
    return "Aquisição a decidir"
  }
  if (it.kind === "bolsa") return `Compromisso por competência${it.conditions ? " · frequência e unidades curriculares" : ""}`
  return FIN_LABEL[it.finSituation ?? "pendente"]
}

function SituationPair({ item, docVig, stage, fins }: { item: EffItem; docVig: DayRange | null; stage: boolean; fins: FinRecord[] }) {
  const t = temporalSituation(item.range, docVig, item.dateUndetermined)
  const fin = finLine(item, fins)
  return (
    <div className={cn("leading-tight", stage ? "flex gap-3 text-[12px] whitespace-nowrap" : "text-[10.5px]")}>
      <div className={t.key === "dentro" ? "text-foreground" : t.key === "sem_ref" ? "text-muted-foreground" : "font-semibold text-[#9A4A08]"}>
        ⏱ {TEMPORAL_LABEL[t.key]}{t.months ? ` · ${t.months} m` : ""}
      </div>
      <div className="truncate text-muted-foreground" title={fin}>R$ {fin}</div>
    </div>
  )
}

const CARD_DEFAULT: Record<TwoTimesCardId, string> = { continuidade: "Continuidade temporal", compromissos: "Compromissos financeiros", decisoes: "Decisões" }

/**
 * The three summary quadrants under the timeline. Their lines are computed from the records; the
 * title, a free note and the visibility are configurable (presentation layer). No total is copied
 * from earlier presentations.
 */
function SummaryCards({ stage, cfg, courses, items, fins, docVig }: { stage: boolean; cfg: TwoTimesConfig; courses: EffItem[]; items: EffItem[]; fins: FinRecord[]; docVig: DayRange | null }) {
  const decisionsAll = useStudio((s) => s.doc.decisions)
  const [editing, setEditing] = useState<TwoTimesCardId | null>(null)
  const money = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })
  const setCard = (id: TwoTimesCardId, p: { title?: string; hidden?: boolean; note?: string }) =>
    useStudio.getState().commit("Dois Tempos · quadro", (d) => {
      const tt = d.presentation.twoTimes ?? {}
      return { ...d, presentation: { ...d.presentation, twoTimes: { ...tt, cards: { ...(tt.cards ?? {}), [id]: { ...(tt.cards?.[id] ?? {}), ...p } } } } }
    })

  const continuity: string[] = []
  for (const c of courses) {
    const a = docVig && !c.dateUndetermined ? partAfter(c.range, docVig) : null
    const hyp = c.certainty === "hipotese" || c.certainty === "planejado"
    if (a && hyp) continuity.push(`${shortNameOf(c)} (hipótese de cenário): ${calendarMonthsTouched(a)} meses previstos após a vigência (${fmtMonthsSpan(a)})`)
    else if (a) continuity.push(`${shortNameOf(c)}: ${calendarMonthsTouched(a)} meses de formação após a vigência (${fmtMonthsSpan(a)})`)
    else if (c.dateUndetermined && docVig && c.range.start >= docVig.end) continuity.push(`${shortNameOf(c)}: previsto para ${c.start.slice(0, 4)}–${c.end.slice(0, 4)}, fora da vigência de referência — financiamento a definir`)
  }
  for (const b of items.filter((i) => i.kind === "bolsa" && i.parentId && !i.dateUndetermined && i.certainty !== "hipotese")) {
    const a = docVig ? partAfter(b.range, docVig) : null
    if (a) continuity.push(`${shortNameOf(b)}: ${calendarMonthsTouched(a)} competências após a vigência`)
  }
  for (const o of items.filter((i) => i.kind === "operacao")) if (docVig && o.range.end <= docVig.end + 31 && courses.some((c) => !c.dateUndetermined && c.range.end > docVig.end)) continuity.push(`${shortNameOf(o)}: registro até ${fmtDate(o.end, "month")} — continuidade a analisar`)

  const commitments: string[] = []
  for (const c of courses) {
    const acq = acqOf(fins, c.id)
    if (!acq) {
      commitments.push(`${shortNameOf(c)}: aquisição não registrada`)
      continue
    }
    if (acq.acqStatus === "integralmente_pago") {
      const { lastDate } = paidOf(fins, acq)
      commitments.push(`${shortNameOf(c)}: ${acq.contractValue != null ? money(acq.contractValue) : "valor não informado"} — pago${lastDate ? ` em ${fmtDate(lastDate, "month")}` : " (pagamento sem registro)"} · comprovação ${acq.proof === "comprovado" ? "registrada" : "pendente"}`)
    } else {
      const v = acq.contractValue ?? acq.quoteValue
      commitments.push(`${shortNameOf(c)}: ${finLine(c, fins)}${v != null ? ` · ${money(v)}` : ""}${acq.paymentMode === "unico" ? " · pagamento único previsto" : ""}`)
    }
  }
  for (const b of items.filter((i) => i.kind === "bolsa" && i.parentId)) {
    const parcels = fins.filter((f) => f.kind === "parcela" && f.actionId === b.id)
    const hyp = b.certainty === "hipotese" || b.certainty === "planejado" || !!b.dateUndetermined
    const total = calendarMonthsTouched(b.range)
    const first = ymd(b.range.start)
    const inRange = new Set<string>()
    for (let d = dayOf(first.y, first.m); d < b.range.end; d = addMonths(d, 1)) inRange.add(`${ymd(d).y}-${String(ymd(d).m).padStart(2, "0")}`)
    const paid = new Set(parcels.filter((p) => p.parcelStatus === "paga").map((p) => p.competencia ?? p.start?.slice(0, 7)).filter((c): c is string => !!c && inRange.has(c))).size
    commitments.push(
      hyp
        ? `${shortNameOf(b)}: previsão (hipótese) — nenhum compromisso registrado`
        : parcels.length
          ? `${shortNameOf(b)}: ${paid} de ${total} competências com parcela registrada como paga · ${total - paid} sem registro de pagamento`
          : `${shortNameOf(b)}: ${total} competências sem registro de parcela — obrigação a analisar`,
    )
  }
  const decisions = decisionsAll.filter((d) => d.status !== "decidido").map((d) => d.title)

  const cards: { id: TwoTimesCardId; lines: string[]; tone: string }[] = [
    { id: "continuidade", lines: continuity.length ? continuity : ["Nenhum curso ultrapassa a vigência de referência neste cenário."], tone: "#9A4A08" },
    { id: "compromissos", lines: commitments.length ? commitments : ["Nenhum compromisso registrado."], tone: C.blue },
    { id: "decisoes", lines: decisions.length ? decisions : ["Nenhuma decisão pendente registrada."], tone: C.navy },
  ]
  const hidden = cards.filter((c) => cfg.cards?.[c.id]?.hidden)
  const visible = cards.filter((c) => !cfg.cards?.[c.id]?.hidden)
  return (
    <div className="mt-3">
      <div className={cn("grid gap-3", stage ? "grid-cols-3" : "grid-cols-1 lg:grid-cols-3")}>
        {visible.map((c) => {
          const conf = cfg.cards?.[c.id] ?? {}
          const title = conf.title ?? CARD_DEFAULT[c.id]
          return (
            <section key={c.id} aria-label={title} className={cn("min-w-0 rounded-xl border bg-white", "p-3")} style={{ borderTop: `3px solid ${c.tone}` }}>
              <div className="flex items-center gap-2">
                {editing === c.id && !stage ? (
                  <input
                    autoFocus
                    aria-label="Título do quadro"
                    className="field !py-0.5 text-[12px] font-bold"
                    defaultValue={title}
                    onBlur={(e) => {
                      const v = e.target.value.trim()
                      if (v !== title) setCard(c.id, { title: v && v !== CARD_DEFAULT[c.id] ? v : undefined })
                      setEditing(null)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") (e.target as HTMLInputElement).blur()
                      if (e.key === "Escape") setEditing(null)
                    }}
                  />
                ) : (
                  <h3 className={cn("font-bold tracking-[0.1em] uppercase", stage ? "text-[15px]" : "text-[11px]")} style={{ color: c.tone }} onDoubleClick={() => !stage && setEditing(c.id)} title={stage ? undefined : "Duplo clique para renomear"}>
                    {title}
                  </h3>
                )}
                {!stage && (
                  <button aria-label={`Ocultar quadro ${title}`} className="ml-auto rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground" onClick={() => setCard(c.id, { hidden: true })}>
                    <EyeOff className="size-3.5" />
                  </button>
                )}
              </div>
              <ul className={cn("mt-1.5 space-y-1 leading-snug text-foreground", stage ? "text-[15px]" : "text-[12px]")}>
                {c.lines.slice(0, stage ? 3 : 8).map((l) => <li key={l} className={stage ? "truncate" : undefined} title={stage ? l : undefined}>• {l}</li>)}
                {c.lines.length > (stage ? 3 : 8) && <li className="text-muted-foreground">+ {c.lines.length - (stage ? 3 : 8)} {c.lines.length - (stage ? 3 : 8) === 1 ? "item" : "itens"}{stage ? " no Estúdio" : ""}</li>}
              </ul>
              {!stage ? (
                <textarea
                  key={conf.note ?? ""}
                  aria-label={`Nota do quadro ${title}`}
                  className="field mt-2 min-h-[34px] !text-[11.5px]"
                  placeholder="Nota livre (opcional)"
                  defaultValue={conf.note ?? ""}
                  onBlur={(e) => e.target.value !== (conf.note ?? "") && setCard(c.id, { note: e.target.value || undefined })}
                />
              ) : (
                conf.note && <p className="mt-1 truncate text-[14px] text-muted-foreground">{conf.note}</p>
              )}
            </section>
          )
        })}
      </div>
      {!stage && hidden.length > 0 && (
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11.5px] text-muted-foreground">
          Quadros ocultos:
          {hidden.map((c) => (
            <button key={c.id} className="flex items-center gap-1 text-primary hover:underline" onClick={() => setCard(c.id, { hidden: false })}>
              <Eye className="size-3" /> {cfg.cards?.[c.id]?.title ?? CARD_DEFAULT[c.id]}
            </button>
          ))}
        </div>
      )}
      {!stage && <p className="mt-1.5 text-[11px] text-muted-foreground">Os quadros são calculados dos registros cadastrados (informados, a validar). Nenhum total é copiado de apresentações anteriores sem a soma dos componentes. “Após a vigência” é um fato de calendário; cobertura depende de documentos.</p>}
    </div>
  )
}
