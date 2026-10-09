import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { ChevronLeft, ChevronRight, Sparkles, X as XIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { addMonths, calendarMonthsTouched, dayOf, fmtDate, fmtMonthsSpan, fromDay, monthShort, partAfter, toDay, ymd, type DayRange } from "@/lib/dates"
import { summarizeScenario, type EffItem } from "@/lib/analysis"
import { C, itemColor, statusOf, barStyleFor } from "@/lib/visual"
import { docVigRange, offeringLabel, shortNameOf, TEMPORAL_LABEL, temporalSituation } from "@/lib/v6"
import { FIN_LABEL } from "@/data/types"
import { useStudio } from "@/store/store"
import { useEffectiveItems, useProjectColor } from "@/store/hooks"

/**
 * DOIS TEMPOS DO PROJETO — the instrument's time and the activities' time on one shared scale.
 * Tempo 1 (vigência) on the upper rail, Tempo 2 (execução) on the lower one. The course bar is never
 * cut at the vigência end; the part after it is orange. Calendar continuity ≠ financial coverage.
 */

export const TWO_TIMES_STEPS = [
  "",
  "Tempo 1 — a vigência: o período formal de referência do instrumento.",
  "O encerramento de referência: a linha que separa os dois tempos.",
  "Tempo 2 — a formação: o curso segue o calendário escolar.",
  "O trecho posterior ao encerramento, em meses-calendário.",
  "As bolsas têm períodos próprios, condicionados.",
  "Situação temporal e situação financeira são perguntas diferentes.",
  "E o próximo ciclo? Os cenários do Projeto 3 — todos hipóteses.",
]
const N = TWO_TIMES_STEPS.length - 1

interface Row {
  key: string
  label: string
  sub?: string
  items: EffItem[]
  rail: 1 | 2
  stepShown: number
}

export function TwoTimes({ size = "studio", projectId = "p2" }: { size?: "studio" | "stage"; projectId?: string }) {
  const doc = useStudio((s) => s.doc)
  const scenarioId = useStudio((s) => s.scenarioId)
  const items = useEffectiveItems()
  const colorOf = useProjectColor()
  const stage = size === "stage"
  const k = stage ? 1.2 : 1
  const wrap = useRef<HTMLDivElement>(null)
  const [W, setW] = useState(stage ? 1680 : 1100)
  const [step, setStep] = useState(0)

  useLayoutEffect(() => {
    if (stage || !wrap.current) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(720, Math.floor(e.contentRect.width))))
    ro.observe(wrap.current)
    return () => ro.disconnect()
  }, [stage])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.isContentEditable || t.closest("input,select,textarea")) return
      if (step === 0) return
      if (e.key === "ArrowRight" || e.key === " ") setStep((s) => Math.min(N, s + 1))
      else if (e.key === "ArrowLeft") setStep((s) => Math.max(0, s - 1))
      else if (e.key === "Escape") setStep(0)
      else return
      e.preventDefault()
      e.stopImmediatePropagation()
    }
    window.addEventListener("keydown", onKey, { capture: true })
    return () => window.removeEventListener("keydown", onKey, { capture: true })
  }, [step])

  const mine = items.filter((i) => i.projectId === projectId && !i.hidden)
  const vigEff = mine.find((i) => i.kind === "vigencia")
  const docVig = docVigRange(doc, projectId)
  const hypVig: DayRange | null = vigEff && docVig && vigEff.range.end !== docVig.end ? vigEff.range : null
  const plan = mine.find((i) => i.kind === "planejamento" && !/operacional/i.test(i.name)) ?? mine.find((i) => i.kind === "planejamento")
  const marcos = mine.filter((i) => i.kind === "marco")
  const courses = mine.filter((i) => i.kind === "curso").sort((a, b) => a.range.start - b.range.start)
  const mainCourse = courses.find((c) => c.certainty !== "hipotese") ?? courses[0]
  const consKeys = [...new Set(mine.filter((i) => i.consolidation).map((i) => i.consolidation!))]
  const ops = mine.filter((i) => i.kind === "operacao")
  const p3 = items.find((i) => i.kind === "projeto" && i.projectId === "p3")
  const ref = toDay(doc.settings.referenceDate)

  const rows: Row[] = [
    ...courses.flatMap((c): Row[] => {
      const bolsas = mine.filter((b) => b.kind === "bolsa" && !b.consolidation && b.parentId === c.id)
      return [
        { key: c.id, label: shortNameOf(c), sub: `${offeringLabel(doc, c, false).split(" · ").slice(1).join(" · ")}${c.certainty === "hipotese" ? " · cenário" : ""}`, items: [c], rail: 2, stepShown: c === mainCourse ? 3 : 5 },
        ...bolsas.map((b): Row => ({ key: b.id, label: shortNameOf(b), sub: "período registrado, condicionado", items: [b], rail: 2, stepShown: 5 })),
      ]
    }),
    ...consKeys.map((key): Row => {
      const c = (doc.consolidations ?? []).find((x) => x.id === key)
      return { key: `cons-${key}`, label: c?.name ?? key, sub: c?.subtitle, items: mine.filter((i) => i.consolidation === key), rail: 2, stepShown: 5 }
    }),
    ...ops.map((o): Row => ({ key: o.id, label: shortNameOf(o), sub: "equipe, estrutura e serviços", items: [o], rail: 2, stepShown: 6 })),
  ]

  // Shared time scale for both rails.
  const allRanges = [docVig, hypVig, plan?.range, ...rows.flatMap((r) => r.items.map((i) => i.range)), step >= 7 && p3 ? p3.range : null].filter((x): x is DayRange => !!x)
  const d0 = dayOf(ymd(Math.min(...allRanges.map((r) => r.start))).y, 1)
  const d1 = dayOf(ymd(Math.max(...allRanges.map((r) => r.end)) - 1).y + 1, 1)
  const LABEL = stage ? 360 : 230
  const RIGHT = stage ? 40 : 260
  const plotW = W - LABEL - RIGHT
  const X = (d: number) => LABEL + ((d - d0) / (d1 - d0)) * plotW

  const AX = 0
  const AXH = 62 * k
  const R1 = AXH + 22 * k
  const RAIL1_H = (stage ? 92 : 104) * k
  const R2 = R1 + RAIL1_H + (stage ? 26 : 40) * k
  const ROW = (stage ? 40 : 44) * k
  const BAR = 26 * k
  const H = R2 + 34 * k + rows.length * ROW + 46 * k

  const course = mainCourse
  const courseAfter = course && docVig ? partAfter(course.range, docVig) : null
  const courseMonths = calendarMonthsTouched(courseAfter)
  const shown = (r: Row) => step === 0 || step >= r.stepShown
  const dimRail = (rail: 1 | 2) => (step === 1 && rail === 2 ? 0.18 : 1)
  const summaries = useMemo(() => doc.scenarios.map((s) => summarizeScenario(doc, s.id, mainCourse?.id ?? "t1")), [doc, mainCourse?.id])
  const pendingDecisions = doc.decisions.filter((d) => d.status !== "decidido" && ["curso", "bolsas", "operacao", "administrativo"].includes(d.topic))

  const fs = (n: number) => n * k
  const ticks: { day: number; m: number; y: number }[] = []
  for (let d = d0; d < d1; d = addMonths(d, 1)) ticks.push({ day: d, ...ymd(d) })

  return (
    <div ref={wrap} className={cn("flex h-full flex-col bg-white", !stage && "overflow-auto")}>
      <div className={cn("flex flex-wrap items-center gap-3", stage ? "mb-4" : "border-b px-5 py-3")}>
        {!stage && (
          <div>
            <h2 className="font-display text-[17px] font-bold text-navy">Dois Tempos do Projeto</h2>
            <p className="text-[11.5px] text-muted-foreground">Tempo 1 — vigência do instrumento · Tempo 2 — execução das atividades. Mesma escala, mesmos registros.</p>
          </div>
        )}
        <div className={cn("flex items-center gap-2", stage ? "ml-auto" : "ml-auto")}>
          {step === 0 ? (
            <Button variant="accent" className={stage ? "h-14 px-6 text-[20px] font-bold" : ""} onClick={() => setStep(1)}>
              <Sparkles className={stage ? "size-6" : "size-4"} /> {stage ? "EXPLICAR VIGÊNCIA" : "Explicar dois tempos"}
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

      <div className={cn(!stage && "px-5 py-4")}>
        {step > 0 && (
          <div className={cn("mb-3 rounded-lg border bg-[#F7F9FC] font-semibold text-foreground", stage ? "px-5 py-3 text-[22px]" : "px-3 py-2 text-[13px]")} role="status">
            {TWO_TIMES_STEPS[step]}
            {step === 4 && courseAfter && <span className="text-[#9A4A08]"> {courseMonths} meses-calendário: {fmtMonthsSpan(courseAfter)}.</span>}
          </div>
        )}
        <svg width={W} height={H} role="img" aria-label="Dois tempos do projeto: vigência e execução no mesmo eixo" style={{ fontFamily: "Inter, system-ui, sans-serif", display: "block" }}>
          <defs>
            <pattern id={`tt-after-${size}`} patternUnits="userSpaceOnUse" width={8 * k} height={8 * k} patternTransform="rotate(45)">
              <rect width={8 * k} height={8 * k} fill={C.after} />
              <line x1="0" y1="0" x2="0" y2={8 * k} stroke="#fff" strokeWidth={2 * k} strokeOpacity="0.3" />
            </pattern>
          </defs>

          {/* Axis */}
          {[...new Set(ticks.map((t) => t.y))].map((y) => {
            const a = Math.max(d0, dayOf(y, 1))
            const b = Math.min(d1, dayOf(y + 1, 1))
            return (
              <g key={y}>
                <rect x={X(a) + 1} y={AX} width={X(b) - X(a) - 2} height={26 * k} fill="#E6EBF1" />
                <text x={(X(a) + X(b)) / 2} y={AX + 18 * k} fontSize={fs(14)} fontWeight={800} fill={C.text} textAnchor="middle">{y}</text>
                {[0, 1].map((h) => (
                  <g key={h}>
                    <rect x={X(dayOf(y, h * 6 + 1)) + 1} y={AX + 28 * k} width={X(dayOf(y, h * 6 + 7)) - X(dayOf(y, h * 6 + 1)) - 2} height={16 * k} fill="#F1F4F8" />
                    <text x={(X(dayOf(y, h * 6 + 1)) + X(dayOf(y, h * 6 + 7))) / 2} y={AX + 40 * k} fontSize={fs(10.5)} fontWeight={600} fill={C.text2} textAnchor="middle">{h + 1}º sem</text>
                  </g>
                ))}
              </g>
            )
          })}
          {ticks.map((t) => (
            <text key={t.day} x={(X(t.day) + X(addMonths(t.day, 1))) / 2} y={AX + 56 * k} fontSize={fs(9)} fontFamily="JetBrains Mono, monospace" textAnchor="middle"
              fill={docVig && t.day === docVig.end ? C.vigLine : C.text3} fontWeight={docVig && t.day === docVig.end ? 800 : 500}>
              {monthShort(t.m)[0].toUpperCase()}
            </text>
          ))}

          {/* After the documental end: light orange — temporal attention, not a financial verdict */}
          {docVig && <rect x={X(docVig.end)} y={R1 - 10 * k} width={Math.max(0, X(d1) - X(docVig.end))} height={H - R1 - 30 * k} fill={C.afterSoft} />}
          {[...new Set(ticks.map((t) => t.y))].map((y) => (
            <line key={`g${y}`} x1={X(dayOf(y, 1))} x2={X(dayOf(y, 1))} y1={R1 - 10 * k} y2={H - 40 * k} stroke={C.grid} />
          ))}

          {/* ── Rail 1: Tempo da vigência ── */}
          <g opacity={dimRail(1)} style={{ transition: "opacity 300ms" }}>
            <text x={LABEL - 16} y={R1 + 14 * k} fontSize={fs(11)} fontWeight={800} letterSpacing={1.2} fill={C.navy} textAnchor="end">TEMPO 1</text>
            <text x={LABEL - 16} y={R1 + 32 * k} fontSize={fs(13)} fontWeight={700} fill={C.text} textAnchor="end">Vigência do projeto</text>
            {plan && (
              <g>
                <rect x={X(plan.range.start)} y={R1} width={X(plan.range.end) - X(plan.range.start)} height={12 * k} rx={2} fill={C.plan} fillOpacity={0.35} stroke={C.plan} />
                <text x={X(plan.range.start) + 6} y={R1 + 9.5 * k} fontSize={fs(9.5)} fontWeight={600} fill={C.text2}>planejamento original · {fmtDate(plan.start, "month")}–{fmtDate(plan.end, "month")}</text>
              </g>
            )}
            {docVig && (
              <g>
                <rect x={X(docVig.start)} y={R1 + 20 * k} width={X(docVig.end) - X(docVig.start)} height={34 * k} rx={4} fill={C.navy}
                  stroke={step === 1 ? C.blue : "none"} strokeWidth={step === 1 ? 4 : 0} />
                <text x={X(docVig.start) + 12 * k} y={R1 + 42 * k} fontSize={fs(13)} fontWeight={700} fill="#fff">
                  {X(docVig.end) - X(docVig.start) > 330 * k ? "Vigência de referência · " : "Vigência · "}{fmtDate(fromDay(docVig.start), "month")} – {fmtDate(fromDay(docVig.end - 1), "month")}
                </text>
              </g>
            )}
            {docVig && hypVig && (
              <g>
                <rect x={X(docVig.end)} y={R1 + 20 * k} width={Math.max(0, X(hypVig.end) - X(docVig.end))} height={34 * k} rx={4} fill="#fff" stroke={C.scenario} strokeWidth={2} strokeDasharray="7 5" />
                <text x={X(docVig.end) + 8 * k} y={R1 + 42 * k} fontSize={fs(11)} fontWeight={700} fill={C.scenario}>cenário: até {fmtDate(fromDay(hypVig.end - 1))}</text>
              </g>
            )}
            {marcos.map((m) => (
              <g key={m.id}>
                <path d={`M${X(m.range.start)},${R1 + 62 * k} l${7 * k},${7 * k} l${-7 * k},${7 * k} l${-7 * k},${-7 * k} Z`} fill="#fff" stroke={C.navy} strokeWidth={2} />
                <text x={X(m.range.start) + 12 * k} y={R1 + 73 * k} fontSize={fs(10.5)} fill={C.text2}>{fmtDate(m.start)} · marco jurídico (natureza a conciliar)</text>
              </g>
            ))}
            {step >= 7 && p3 && (
              <g>
                <rect x={X(p3.range.start)} y={R1 + 84 * k} width={Math.min(X(d1), X(p3.range.end)) - X(p3.range.start)} height={16 * k} rx={3} fill="#fff" stroke={colorOf("p3")} strokeWidth={2} strokeDasharray="6 4" />
                <text x={X(p3.range.start) + 8} y={R1 + 96 * k} fontSize={fs(10.5)} fontWeight={700} fill={colorOf("p3")}>Projeto 3 · em modelagem · a partir de {fmtDate(p3.start, "month")}</text>
              </g>
            )}
          </g>

          {/* ── Rail 2: Tempo da formação / execução ── */}
          <text x={LABEL - 16} y={R2 + 4 * k} fontSize={fs(11)} fontWeight={800} letterSpacing={1.2} fill={C.blue} textAnchor="end" opacity={dimRail(2)}>TEMPO 2</text>
          <text x={LABEL - 16} y={R2 + 22 * k} fontSize={fs(13)} fontWeight={700} fill={C.text} textAnchor="end" opacity={dimRail(2)}>Execução das atividades</text>
          {rows.map((r, i) => {
            const y = R2 + 34 * k + i * ROW
            const visibleRow = shown(r)
            const focus = (step === 3 || step === 4) && r.items[0] === course ? true : step === 5 && r.items[0]?.kind === "bolsa"
            const fade = step === 1 ? 0.18 : !visibleRow ? 0.08 : (step === 3 || step === 4) && r.items[0] !== course ? 0.3 : 1
            return (
              <g key={r.key} opacity={fade} style={{ transition: "opacity 300ms" }}>
                <text x={LABEL - 16} y={y + ROW / 2 + (r.sub ? -1 : 4) * k} fontSize={fs(12.5)} fontWeight={r.items[0]?.kind === "curso" ? 700 : 500} fill={C.text} textAnchor="end">{r.label}</text>
                {r.sub && <text x={LABEL - 16} y={y + ROW / 2 + 12 * k} fontSize={fs(10.5)} fill={C.text2} textAnchor="end">{r.sub}</text>}
                {r.items.map((it, j) => {
                  const color = itemColor(it.kind, colorOf(it.projectId), it.color)
                  const st = statusOf(it, ref)
                  const bs = barStyleFor(st.key, color)
                  const multi = r.items.length > 1
                  const lane = multi ? j % 2 : 0
                  const bh = multi ? BAR / 2 + 2 * k : BAR
                  const by = y + (ROW - (multi ? bh * 2 + 3 : BAR)) / 2 + lane * (bh + 3)
                  const after = docVig && (step === 0 || step >= 4) ? partAfter(it.range, docVig) : null
                  return (
                    <g key={it.id} style={{ cursor: "pointer" }} onClick={() => !stage && useStudio.getState().select([it.id])}>
                      <rect x={X(it.range.start)} y={by} width={Math.max(3, X(it.range.end) - X(it.range.start))} height={bh} rx={3}
                        fill={bs.fill} fillOpacity={bs.fillOpacity} stroke={bs.stroke} strokeWidth={Math.max(1, bs.strokeWidth)} strokeDasharray={bs.dash} />
                      {after && (
                        <rect x={X(after.start)} y={by} width={Math.max(3, X(after.end) - X(after.start))} height={bh} rx={3}
                          fill={st.key === "cenario" || st.key === "planejado" ? "#fff" : `url(#tt-after-${size})`} stroke={C.after} strokeWidth={st.key === "cenario" || st.key === "planejado" ? 1.5 : 0} strokeDasharray={st.key === "cenario" ? "6 4" : undefined} />
                      )}
                      {!multi && X(it.range.end) - X(it.range.start) > 120 * k && (
                        <text x={X(it.range.start) + 9 * k} y={by + bh / 2 + 4 * k} fontSize={fs(11)} fontWeight={600} fill={bs.text}>{fmtDate(it.start, "month")} – {fmtDate(it.end, "month")}</text>
                      )}
                      {focus && <rect x={X(it.range.start) - 4} y={by - 4} width={X(it.range.end) - X(it.range.start) + 8} height={bh + 8} rx={5} fill="none" stroke={C.blue} strokeWidth={2.5} />}
                    </g>
                  )
                })}
                {/* Temporal vs financial — two independent answers (studio: always; stage: step 6) */}
                {(!stage || step === 6) && (
                  <foreignObject x={stage ? X(d1) - 520 : W - RIGHT + 10} y={y + 3} width={stage ? 510 : RIGHT - 14} height={ROW - 6}>
                    <SituationPair items={r.items} docVig={docVig} stage={stage} />
                  </foreignObject>
                )}
              </g>
            )
          })}

          {/* Step 4: bracket over the course's remaining part */}
          {step === 4 && courseAfter && course && (
            (() => {
              const i = rows.findIndex((r) => r.items[0] === course)
              const y = R2 + 34 * k + i * ROW
              return (
                <g>
                  <path d={`M${X(courseAfter.start)},${y + 4} v${-8 * k} H${X(courseAfter.end)} v${8 * k}`} stroke={C.afterText} strokeWidth={2.5} fill="none" />
                  <text x={X(courseAfter.start)} y={y - 8 * k} fontSize={fs(13)} fontWeight={800} fill={C.afterText}>{courseMonths} meses-calendário após o encerramento</text>
                </g>
              )
            })()
          )}

          {/* Reference date and the documental / hypothetical ends */}
          <line x1={X(ref)} x2={X(ref)} y1={R1 - 10 * k} y2={H - 40 * k} stroke="#5FA548" strokeWidth={2 * k} />
          {hypVig && <line x1={X(hypVig.end)} x2={X(hypVig.end)} y1={R1 - 10 * k} y2={H - 40 * k} stroke={C.scenario} strokeWidth={1.8 * k} strokeDasharray="7 5" />}
          {docVig && <line x1={X(docVig.end)} x2={X(docVig.end)} y1={AX + 46 * k} y2={H - 40 * k} stroke={C.vigLine} strokeWidth={(step === 2 ? 4.5 : 2.2) * k} style={{ transition: "stroke-width 250ms" }} />}
          {step === 2 && docVig && (
            <g>
              <rect x={X(docVig.end) - 110 * k} y={R1 + 58 * k} width={220 * k} height={28 * k} rx={6} fill={C.vigLine} />
              <text x={X(docVig.end)} y={R1 + 77 * k} fontSize={fs(15)} fontWeight={800} fill="#fff" textAnchor="middle">{fmtDate(fromDay(docVig.end - 1))}</text>
            </g>
          )}
          <g fontSize={fs(11.5)} fontWeight={700}>
            {docVig && <text x={X(docVig.end) + 6} y={H - 22 * k} fill={C.vigLine}>↑ {fmtDate(fromDay(docVig.end - 1))} · encerramento de referência (linha de base documental)</text>}
            {hypVig && <text x={X(hypVig.end) + 6} y={H - 6 * k} fill={C.scenario}>┆ {fmtDate(fromDay(hypVig.end - 1))} · hipótese de cenário</text>}
            <text x={X(ref) - 6} y={H - 22 * k} fill="#3E7D2C" textAnchor="end">referência {fmtDate(doc.settings.referenceDate)}</text>
          </g>
        </svg>

        {step === 6 && (
          <div className={cn("mt-3 grid gap-3 rounded-lg border p-4", stage ? "grid-cols-2 text-[19px]" : "grid-cols-1 text-[12.5px] md:grid-cols-2")}>
            <div>
              <div className={cn("font-bold tracking-wider text-[#9A4A08] uppercase", stage ? "text-[15px]" : "text-[11px]")}>Continuidade e cobertura a decidir</div>
              <ul className="mt-1.5 space-y-1">{pendingDecisions.map((d) => <li key={d.id}>→ {d.title}</li>)}</ul>
            </div>
            <p className="text-muted-foreground">
              “Após a vigência” é um fato de calendário. Cobertura, pagamento antecipado ou compromisso futuro dependem de documentos — e saldo disponível não autoriza, por si, despesa posterior à vigência.
            </p>
          </div>
        )}
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
                <div className={s.t1After ? "font-semibold text-[#9A4A08]" : "text-muted-foreground"}>{s.t1After ? `Técnico 1: ${s.t1After.months} m após` : "Técnico 1 dentro da vigência"}</div>
                <div className="text-muted-foreground">P3 a partir de {s.p3 ? fmtDate(s.p3.start, "month") : "—"} · não aprovado</div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function SituationPair({ items, docVig, stage }: { items: EffItem[]; docVig: DayRange | null; stage: boolean }) {
  const t = items.map((it) => temporalSituation(it.range, docVig, it.dateUndetermined))
  const worst = t.find((x) => x.key === "integral") ?? t.find((x) => x.key === "parcial") ?? t[0]
  const fins = [...new Set(items.map((i) => i.finSituation ?? "pendente"))]
  return (
    <div className={cn("flex h-full flex-col justify-center leading-tight", stage ? "text-[15px]" : "text-[10.5px]")}>
      <span className={worst?.key === "dentro" ? "text-foreground" : worst?.key === "sem_ref" ? "text-muted-foreground" : "font-semibold text-[#9A4A08]"}>
        ⏱ {worst ? TEMPORAL_LABEL[worst.key] : "—"}{worst?.months ? ` · ${worst.months} m` : ""}
      </span>
      <span className="truncate text-muted-foreground">R$ {fins.map((f) => FIN_LABEL[f]).join(" / ")}</span>
    </div>
  )
}
