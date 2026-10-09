import { useEffect, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { ChevronLeft, ChevronRight, Sparkles, X as Close } from "lucide-react"
import { Button } from "@/components/ui/button"
import { calendarMonthsTouched, dayOf, fmtDate, fmtMonthsSpan, fromDay, partAfter, toDay, type DayRange } from "@/lib/dates"
import { vigenciaOf, type EffItem } from "@/lib/analysis"
import { C, barStyleFor, itemColor, statusOf } from "@/lib/visual"
import { CERTAINTY_LABEL } from "@/data/types"
import { useStudio } from "@/store/store"
import { useAnalysis, useProjectColor } from "@/store/hooks"
import { Movable, SceneNotes, SceneTitle } from "./Stage"
import { StageAxis, Stripes, stageScale } from "./common"

const LABEL_R = 452
const PLOT_X = 480
const PLOT_W = 1320
const AXIS_Y = 288
const ROW_Y = 404
const ROW_H = 62
const BAR_H = 40

const CAPTIONS = [
  "",
  "1 · Esta é a vigência de referência do Projeto 2: o período formalmente registrado, sujeito à validação do instrumento.",
  "2 · Seu encerramento de referência é a linha vermelha.",
  "3 · O Curso Técnico 1 segue o calendário escolar e atravessa essa data.",
  "4 · O trecho posterior, contado em meses-calendário — não é um cálculo financeiro.",
  "5 · As bolsas são outra dimensão: período registrado, condicionado a frequência e desempenho.",
  "6 · O que está registrado e o que precisa ser decidido.",
]
const STEPS = CAPTIONS.length - 1

type RowDef = { key: string; label: string; it?: EffItem; hyp?: boolean }

export function Scene3() {
  const doc = useStudio((s) => s.doc)
  const { items } = useAnalysis()
  const colorOf = useProjectColor()
  const [step, setStep] = useState(0)

  const byId = (id: string) => items.find((i) => i.id === id)
  const vig = vigenciaOf(items, "p2")
  const docVig: DayRange | null = vig ? (vig.baseRange ?? vig.range) : null
  const hypVig: DayRange | null = vig?.baseRange ? vig.range : null
  const courseId = doc.presentation.highlightCourseIds[0] ?? "t1"
  const t1 = byId(courseId) ?? items.find((i) => i.kind === "curso" && i.projectId === "p2")
  const t1b = items.find((i) => i.kind === "bolsa" && i.parentId === t1?.id)
  const rows: RowDef[] = [
    { key: "plan", label: "Planejamento original", it: byId("p2-plano") ?? items.find((i) => i.kind === "planejamento" && i.projectId === "p2") },
    { key: "vig", label: "Vigência de referência", it: vig },
    ...(hypVig ? [{ key: "vigh", label: "Vigência — cenário simulado", it: vig, hyp: true }] : []),
    { key: "t1", label: t1?.name ?? "Curso Técnico 1", it: t1 },
    { key: "t1b", label: "Bolsas do Técnico 1", it: t1b },
    { key: "t2", label: "Curso Técnico 2 — cenário", it: byId("t2") },
    { key: "t2b", label: "Bolsas do Técnico 2 — cenário", it: items.find((i) => i.kind === "bolsa" && i.parentId === "t2") },
    { key: "op", label: "Equipe e operação", it: byId("p2-equipe") ?? items.find((i) => i.kind === "operacao" && i.projectId === "p2") },
  ]
  const yOf = (key: string) => ROW_Y + rows.findIndex((r) => r.key === key) * ROW_H
  const bottom = ROW_Y + rows.length * ROW_H
  const ref = toDay(doc.settings.referenceDate)
  const t1After = t1 && docVig ? partAfter(t1.range, docVig) : null
  const t1Months = calendarMonthsTouched(t1After)
  const t1HypAfter = t1 && hypVig ? partAfter(t1.range, hypVig) : null
  const grantsAfter = t1b && docVig ? partAfter(t1b.range, docVig) : null

  const d0 = dayOf(2025, 1)
  const d1 = dayOf(2029, 1)
  const { X } = stageScale(d0, d1, PLOT_X, PLOT_W)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.isContentEditable || t.closest("input,select,textarea")) return
      if (e.key.toLowerCase() === "e") {
        setStep((s) => (s ? 0 : 1))
        e.stopImmediatePropagation()
      } else if (step > 0 && (e.key === "ArrowRight" || e.key === " ")) {
        setStep((s) => Math.min(STEPS, s + 1))
        e.preventDefault()
        e.stopImmediatePropagation()
      } else if (step > 0 && e.key === "ArrowLeft") {
        setStep((s) => Math.max(0, s - 1))
        e.stopImmediatePropagation()
      } else if (step > 0 && e.key === "Escape") {
        setStep(0)
        e.stopImmediatePropagation()
      }
    }
    window.addEventListener("keydown", onKey, { capture: true })
    return () => window.removeEventListener("keydown", onKey, { capture: true })
  }, [step])

  const focusKeys: Record<number, string[]> = { 1: ["vig", "vigh"], 2: ["vig", "vigh"], 3: ["vig", "t1"], 4: ["vig", "t1"], 5: ["vig", "t1b"] }
  const dim = (key: string) => (focusKeys[step] ? !focusKeys[step].includes(key) : false)
  const decisions = doc.decisions.filter((d) => d.status !== "decidido").slice(0, 5)

  return (
    <div className="absolute inset-0">
      <SceneTitle scene={2} eyebrow="Tempo de vigência x tempo de formação" title="A vigência termina. A formação continua." size={62} />

      <Movable k="s2:headline" x={120} y={210} w={1680}>
        <p className="text-[26px] leading-snug text-[#18324A]">
          {t1After ? (
            <>
              <b className="text-[#C83C3C]">{t1Months} meses-calendário</b> de formação após o encerramento da vigência de referência
              <span className="text-[#64748B]"> ({fmtMonthsSpan(t1After)})</span>.
              {hypVig && <span className="text-[#173B63]"> No cenário simulado: {t1HypAfter ? `${calendarMonthsTouched(t1HypAfter)} meses` : "dentro da vigência"}.</span>}
            </>
          ) : (
            <>Neste cenário, o {t1?.name ?? "Curso Técnico 1"} termina dentro da vigência de referência.</>
          )}
        </p>
      </Movable>

      <div className="absolute top-[118px] right-[120px] w-[320px]">
        {step === 0 ? (
          <Button variant="accent" className="h-[64px] w-full justify-center rounded-xl text-[21px] font-bold tracking-wide" onClick={() => setStep(1)}>
            <Sparkles className="size-6" /> EXPLICAR VIGÊNCIA
          </Button>
        ) : (
          <div className="rounded-xl border-2 border-[#173B63]/20 bg-white p-3 shadow-sm">
            <div className="mb-2 flex items-center justify-between text-[17px] font-semibold text-[#173B63]">
              Etapa {step} de {STEPS}
              <button aria-label="Encerrar explicação" className="rounded p-1 hover:bg-muted" onClick={() => setStep(0)}><Close className="size-5" /></button>
            </div>
            <div className="flex gap-2">
              <Button className="h-11 flex-1 justify-center text-[17px]" onClick={() => setStep(Math.max(0, step - 1))}><ChevronLeft className="size-5" /> Voltar</Button>
              <Button variant="accent" className="h-11 flex-1 justify-center text-[17px]" disabled={step === STEPS} onClick={() => setStep(step + 1)}>Avançar <ChevronRight className="size-5" /></Button>
            </div>
          </div>
        )}
      </div>

      <svg className="pointer-events-none absolute inset-0" width={1920} height={1080} role="img" aria-label="Linha do tempo 2025–2028: vigência e formação">
        <defs>
          <Stripes id="s3-after" />
          <clipPath id="s3-plot"><rect x={PLOT_X} y={AXIS_Y} width={PLOT_W} height={bottom - AXIS_Y + 10} /></clipPath>
        </defs>
        {docVig && <rect x={X(docVig.end)} y={AXIS_Y + 108} width={Math.max(0, PLOT_X + PLOT_W - X(docVig.end))} height={bottom - AXIS_Y - 104} fill={C.redSoft} />}
        <StageAxis d0={d0} d1={d1} X={X} y={AXIS_Y} vigEnd={docVig?.end} />
        <g clipPath="url(#s3-plot)">
          {Array.from({ length: 4 }, (_, i) => 2025 + i).map((y) => (
            <line key={y} x1={X(dayOf(y, 1))} x2={X(dayOf(y, 1))} y1={AXIS_Y + 108} y2={bottom} stroke="#C9D3DE" />
          ))}
          {rows.map((r, i) => (
            <rect key={`z${r.key}`} x={PLOT_X} y={ROW_Y + i * ROW_H} width={PLOT_W} height={ROW_H} fill={i % 2 ? "#F6F8FB" : "transparent"} fillOpacity={0.7} />
          ))}
          {rows.map((r) => {
            const it = r.it
            if (!it) return null
            const y = yOf(r.key) + (ROW_H - BAR_H) / 2
            const docRow = r.key === "vig" && !!it.baseRange
            const range = docRow ? it.baseRange! : it.range
            const status = r.hyp ? "cenario" : docRow ? "previsto" : statusOf(it, ref).key
            const color = itemColor(it.kind, colorOf(it.projectId), it.color)
            const bs = barStyleFor(status, color)
            const after = docVig && !["vig", "vigh", "plan"].includes(r.key) ? partAfter(range, docVig) : null
            const highlight = (step === 1 || step === 2) && (r.key === "vig" || r.key === "vigh") ? true : step >= 3 && step <= 4 && r.key === "t1" ? true : step === 5 && r.key === "t1b"
            const x1 = X(range.start)
            const x2 = X(range.end)
            const label = r.key === "vig" || r.key === "vigh" ? `até ${fmtDate(fromDay(range.end - 1))}${r.hyp ? " · cenário, não aprovado" : " · referência"}` : `${fmtDate(it.start, "month")} – ${fmtDate(it.end, "month")}`
            const afterM = calendarMonthsTouched(after)
            return (
              <g key={r.key} style={{ opacity: dim(r.key) ? 0.22 : 1, transition: "opacity 300ms ease" }}>
                <rect x={x1} y={y} width={Math.max(4, x2 - x1)} height={BAR_H} rx={4} fill={bs.fill} fillOpacity={bs.fillOpacity} stroke={bs.stroke} strokeWidth={bs.strokeWidth * 1.6} strokeDasharray={bs.dash ? "10 6" : undefined} />
                {after && (
                  <rect x={X(after.start)} y={y} width={Math.max(4, X(after.end) - X(after.start))} height={BAR_H} rx={4}
                    fill={status === "cenario" ? "#FFFFFF" : "url(#s3-after)"} stroke={C.red} strokeWidth={status === "cenario" ? 2.5 : 0} strokeDasharray={status === "cenario" ? "10 6" : undefined} />
                )}
                {highlight && <rect x={x1 - 5} y={y - 5} width={x2 - x1 + 10} height={BAR_H + 10} rx={7} fill="none" stroke={C.blue} strokeWidth={3} />}
                <text x={Math.max(x1, PLOT_X) + 14} y={y + BAR_H / 2 + 7} fontSize={19} fontWeight={700} fill={bs.text}>{label}</text>
                {after && X(after.end) - X(after.start) > 110 && (
                  <text x={(X(after.start) + X(after.end)) / 2} y={y + BAR_H / 2 + 7} fontSize={18} fontWeight={800} fill={status === "cenario" ? C.red : "#FFFFFF"} textAnchor="middle">
                    {afterM} meses após
                  </text>
                )}
              </g>
            )
          })}
          {/* Reference date, simulated end, documental end */}
          <line x1={X(ref)} x2={X(ref)} y1={AXIS_Y + 108} y2={bottom} stroke="#5FA548" strokeWidth={4} />
          {hypVig && <line x1={X(hypVig.end)} x2={X(hypVig.end)} y1={AXIS_Y + 108} y2={bottom} stroke={C.navy} strokeWidth={3} strokeDasharray="10 7" />}
          {docVig && <line x1={X(docVig.end)} x2={X(docVig.end)} y1={AXIS_Y + 40} y2={bottom} stroke={C.red} strokeWidth={step === 2 ? 7 : 4} style={{ transition: "stroke-width 250ms" }} />}
        </g>

        {/* Row labels */}
        {rows.map((r) => (
          <text key={`l${r.key}`} x={LABEL_R} y={yOf(r.key) + ROW_H / 2 + 7} fontSize={21} fontWeight={["vig", "t1", "t2"].includes(r.key) ? 800 : 500} fill={r.it ? (r.hyp ? C.navy : C.text) : C.text3} textAnchor="end" fontStyle={r.hyp ? "italic" : undefined}
            style={{ opacity: dim(r.key) ? 0.3 : 1, transition: "opacity 300ms ease" }}>
            {r.label}
          </text>
        ))}

        {/* Captions under the chart */}
        <g fontSize={18} fontWeight={700}>
          {docVig && <text x={X(docVig.end) + 10} y={bottom + 30} fill={C.red}>↑ {fmtDate(fromDay(docVig.end - 1))} · encerramento da vigência de referência</text>}
          {hypVig && <text x={X(hypVig.end) + 10} y={bottom + 56} fill={C.navy}>┆ {fmtDate(fromDay(hypVig.end - 1))} · cenário simulado</text>}
          <text x={X(ref) - 10} y={bottom + 30} fill="#3E7D2C" textAnchor="end">referência {fmtDate(doc.settings.referenceDate)}</text>
        </g>

        {/* Step 2: the date, large */}
        {step === 2 && docVig && (
          <g>
            <rect x={X(docVig.end) - 120} y={AXIS_Y - 6} width={240} height={48} rx={8} fill={C.red} />
            <text x={X(docVig.end)} y={AXIS_Y + 27} fontSize={28} fontWeight={800} fill="#FFFFFF" textAnchor="middle">{fmtDate(fromDay(docVig.end - 1))}</text>
          </g>
        )}
        {/* Step 4: calendar-month bracket over the remaining part */}
        {step === 4 && t1After && t1 && (
          <g>
            <path d={`M${X(t1After.start)},${yOf("t1") + 6} v-12 H${X(t1After.end)} v12`} stroke={C.red} strokeWidth={3} fill="none" />
            <rect x={X(t1After.start) - 14} y={yOf("t1") - 52} width={`${t1Months} meses-calendário · ${fmtMonthsSpan(t1After)}`.length * 12.4 + 28} height={40} rx={6} fill="#FFFFFF" stroke={C.red} strokeWidth={2} />
            <text x={X(t1After.start)} y={yOf("t1") - 25} fontSize={21} fontWeight={800} fill={C.red}>{t1Months} meses-calendário · {fmtMonthsSpan(t1After)}</text>
          </g>
        )}
      </svg>

      {/* Narrative caption */}
      <AnimatePresence mode="wait">
        {step > 0 && (
          <motion.div key={step} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}
            className="absolute right-[120px] bottom-[72px] left-[120px] rounded-lg border bg-white px-6 py-3 text-[23px] font-semibold text-[#18324A] shadow-sm">
            {CAPTIONS[step]}
            {step === 5 && grantsAfter && <span className="text-[#C83C3C]"> {calendarMonthsTouched(grantsAfter)} meses do período registrado ficam após a vigência — período registrado não significa bolsa devida.</span>}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Step 6: registered vs to decide */}
      <AnimatePresence>
        {step === 6 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}
            className="absolute top-[392px] left-[120px] grid w-[1100px] grid-cols-2 gap-6 rounded-xl border-2 border-[#173B63]/15 bg-white p-6 shadow-xl">
            <div>
              <div className="text-[16px] font-bold tracking-[0.12em] text-[#087CB8] uppercase">O que está registrado</div>
              <ul className="mt-3 space-y-2.5 text-[19px] leading-snug text-[#18324A]">
                {[vig, t1, t1b].filter(Boolean).map((it) => (
                  <li key={it!.id}>
                    <b>{it!.name}</b> · {fmtDate(it!.kind === "vigencia" && it!.baseRange ? fromDay(it!.baseRange.end - 1) : it!.end, it!.kind === "vigencia" ? "day" : "month")}
                    <span className="ml-2 rounded-full border border-[#E3C25C] whitespace-nowrap bg-[#FFF8DB] px-2 text-[14px] font-semibold text-[#6B4E00]">{CERTAINTY_LABEL[it!.kind === "vigencia" && it!.baseRange ? "a_validar" : it!.certainty]}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-[15px] leading-snug text-[#64748B]">Nenhum destes registros está marcado como comprovado: a documentação ainda precisa ser conciliada.</p>
            </div>
            <div>
              <div className="text-[16px] font-bold tracking-[0.12em] text-[#C83C3C] uppercase">O que precisa ser decidido</div>
              <ul className="mt-3 space-y-2 text-[19px] leading-snug text-[#18324A]">
                {decisions.map((d) => <li key={d.id}>→ {d.title}</li>)}
              </ul>
              <p className="mt-3 text-[15px] leading-snug text-[#64748B]">Continuidade temporal ≠ cobertura financeira ≠ situação contratual. Não é conclusão jurídica.</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {step === 0 && (
        <Movable k="s2:note" x={120} y={966} w={1680}>
          <p className="text-[17px] leading-snug text-[#64748B]">Meses-calendário indicam continuidade temporal; não afirmam ausência de pagamento nem de cobertura. Datas de referência sujeitas à validação documental.</p>
        </Movable>
      )}
      <SceneNotes scene={2} resolveX={(n) => (n.linkedItemId ? (() => { const it = items.find((i) => i.id === n.linkedItemId); return it ? X(it.range.end) - 40 : null })() : null)} />
    </div>
  )
}
