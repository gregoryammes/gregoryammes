import { useEffect, useRef, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { ChevronLeft, ChevronRight, Sparkles, X as Close } from "lucide-react"
import { Button } from "@/components/ui/button"
import { addMonths, dayOf, fmtDate, fmtMonthsSpan, fromDay, monthShort, toDay, ymd } from "@/lib/dates"
import { overrunFor, vigenciaOf, type EffItem } from "@/lib/analysis"
import { barStyle } from "@/lib/visual"
import { useStudio } from "@/store/store"
import { useAnalysis } from "@/store/hooks"
import { Movable, SceneNotes, SceneTitle } from "./Stage"
import { Hatch, stageScale } from "./common"

const LABEL_X = 120
const PLOT_X = 430
const PLOT_W = 1370
const AXIS_Y = 470
const ROW_Y = 500
const ROW_H = 56

const CAPTIONS = [
  "",
  "1 · A faixa laranja é a vigência de referência do Projeto 2 — o período formalmente estabelecido, sujeito à validação do instrumento.",
  "2 · Aproximamos o foco do seu encerramento.",
  "3 · O marco: encerramento de referência da vigência.",
  "4 · Tudo o que acontece antes dele fica em segundo plano.",
  "5 · O Curso Técnico 1 não termina com a vigência: a formação segue normalmente.",
  "6 · As bolsas são uma dimensão separada — vinculadas a frequência e desempenho.",
  "7 · O período posterior, contado em meses-calendário (não é cálculo financeiro).",
  "8 · O que precisa ser analisado e decidido.",
]
const STEPS = CAPTIONS.length - 1

function useTween(target: [number, number], reduce: boolean) {
  const [v, setV] = useState(target)
  const cur = useRef(target)
  useEffect(() => {
    if (reduce) {
      cur.current = target
      setV(target)
      return
    }
    const from = cur.current
    const t0 = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / 900)
      const e = 1 - Math.pow(1 - p, 3)
      const next: [number, number] = [from[0] + (target[0] - from[0]) * e, from[1] + (target[1] - from[1]) * e]
      cur.current = next
      setV(next)
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target[0], target[1], reduce])
  return v
}

export function Scene3() {
  const doc = useStudio((s) => s.doc)
  const { items, overruns } = useAnalysis()
  const reduce = !!useReducedMotion()
  const [step, setStep] = useState(0)

  const byId = (id: string) => items.find((i) => i.id === id)
  const vig = vigenciaOf(items, "p2")
  const courseId = doc.presentation.highlightCourseIds[0] ?? "t1"
  const t1 = byId(courseId) ?? items.find((i) => i.kind === "curso" && i.projectId === "p2")
  const rows: { key: string; label: string; it?: EffItem }[] = [
    { key: "plan", label: "Planejamento original", it: byId("p2-plano") ?? items.find((i) => i.kind === "planejamento" && i.projectId === "p2") },
    { key: "vig", label: "Vigência do Projeto 2", it: vig },
    { key: "t1", label: t1?.name ?? "Curso Técnico 1", it: t1 },
    { key: "t1b", label: "Bolsas do Técnico 1", it: items.find((i) => i.kind === "bolsa" && i.parentId === t1?.id) },
    { key: "t2", label: "Curso Técnico 2 — cenário", it: byId("t2") },
    { key: "t2b", label: "Bolsas do Técnico 2 — cenário", it: items.find((i) => i.kind === "bolsa" && i.parentId === "t2") },
    { key: "op", label: "Equipe e operação", it: byId("p2-equipe") ?? items.find((i) => i.kind === "operacao" && i.projectId === "p2") },
  ]
  const t1Over = t1 ? overrunFor(overruns, t1.id) : undefined
  const grants = rows[3].it
  const grantsOver = grants ? overrunFor(overruns, grants.id) : undefined
  const ref = toDay(doc.settings.referenceDate)
  const vigEnd = vig?.range.end ?? null
  const t1End = t1?.range.end ?? null

  const full: [number, number] = [dayOf(2025, 1), dayOf(2029, 1)]
  const zoomed: [number, number] = vigEnd && t1End ? [addMonths(vigEnd, -15), Math.max(t1End, vigEnd) + 120] : full
  const [d0, d1] = useTween(step >= 2 ? zoomed : full, reduce)
  const { X } = stageScale(d0, d1, PLOT_X, PLOT_W)
  const cx = (d: number) => Math.max(PLOT_X, Math.min(PLOT_X + PLOT_W, X(d)))

  // Narrative keys: → / ← step through while explaining; E toggles.
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

  // Ticks
  const ticks: { day: number; label: string; year: boolean }[] = []
  const span = d1 - d0
  for (let d = dayOf(ymd(d0).y, 1); d < d1; d = addMonths(d, span > 900 ? 3 : 1)) {
    const m = ymd(d)
    if (d >= d0) ticks.push({ day: d, label: m.m === 1 ? String(m.y) : monthShort(m.m), year: m.m === 1 })
  }

  const dimRow = (key: string) => (step === 1 && key !== "vig") || (step === 5 && key !== "t1") || (step === 6 && key !== "t1b")
  const decisions = doc.decisions.filter((d) => d.status !== "decidido").slice(0, 5)

  return (
    <div className="absolute inset-0">
      <SceneTitle scene={2} eyebrow="O desafio da vigência" title="A vigência termina. A formação continua." />

      {/* Key numbers — computed, never typed */}
      <Movable k="s2:kpis" x={120} y={240} w={1340}>
        <div className="grid grid-cols-3 gap-5">
          <Kpi tone="orange" label="Encerramento da vigência" value={vig ? fmtDate(vig.end) : "não cadastrado"} sub={vig?.changed ? "hipótese de cenário" : "referência — a validar"} />
          <Kpi tone="blue" label={`Formação após a vigência · ${t1?.name ?? "Técnico 1"}`} value={t1Over ? `${t1Over.months} ${t1Over.months === 1 ? "mês" : "meses"}` : "nenhum"} sub={t1Over ? `meses-calendário · ${fmtMonthsSpan(t1Over.after)}` : "o curso termina dentro da vigência"} />
          <Kpi tone="ice" label="Bolsas registradas após a vigência" value={grantsOver ? `${grantsOver.months} ${grantsOver.months === 1 ? "mês" : "meses"}` : "nenhum"} sub={grantsOver ? "período registrado · condicionadas a frequência e desempenho" : "dentro da vigência"} />
        </div>
      </Movable>

      <div className="absolute top-[250px] right-[120px] w-[300px]">
        {step === 0 ? (
          <Button variant="accent" className="h-[96px] w-full justify-center rounded-2xl text-[24px] font-bold tracking-wide" onClick={() => setStep(1)}>
            <Sparkles className="size-7" /> EXPLICAR VIGÊNCIA
          </Button>
        ) : (
          <div className="rounded-2xl border border-[#FF7A1A]/60 bg-[#1A0F08]/80 p-3">
            <div className="mb-2 flex items-center justify-between text-[17px] font-semibold text-[#FFB27A]">
              Etapa {step} de {STEPS}
              <button aria-label="Encerrar explicação" className="rounded p-1 hover:bg-white/10" onClick={() => setStep(0)}><Close className="size-5" /></button>
            </div>
            <div className="flex gap-2">
              <Button className="h-12 flex-1 justify-center text-[18px]" onClick={() => setStep(Math.max(0, step - 1))}><ChevronLeft className="size-5" /> Voltar</Button>
              <Button variant="accent" className="h-12 flex-1 justify-center text-[18px]" disabled={step === STEPS} onClick={() => setStep(step + 1)}>Avançar <ChevronRight className="size-5" /></Button>
            </div>
          </div>
        )}
      </div>

      <svg className="pointer-events-none absolute inset-0" width={1920} height={1080} role="img" aria-label="Linha do tempo em camadas 2025–2028">
        <defs>
          <Hatch id="s3-after" />
          <Hatch id="s3-region" color="#FF7A1A" opacity={0.18} size={18} />
          <clipPath id="s3-plot"><rect x={PLOT_X} y={AXIS_Y - 64} width={PLOT_W} height={590} /></clipPath>
          <filter id="s3-glow" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="8" /></filter>
        </defs>

        <g clipPath="url(#s3-plot)">
          {/* After the vigência: distinct region; bars continue through it */}
          {vigEnd != null && (
            <>
              <rect x={X(vigEnd)} y={AXIS_Y} width={Math.max(0, PLOT_X + PLOT_W - X(vigEnd))} height={rows.length * ROW_H + 40} fill="#FF7A1A" fillOpacity={0.06} />
              <rect x={X(vigEnd)} y={AXIS_Y} width={Math.max(0, PLOT_X + PLOT_W - X(vigEnd))} height={rows.length * ROW_H + 40} fill="url(#s3-region)" />
            </>
          )}
          {ticks.map((t, i) => (
            <g key={i}>
              <line x1={X(t.day)} x2={X(t.day)} y1={AXIS_Y} y2={ROW_Y + rows.length * ROW_H} stroke={t.year ? "#2A3F78" : "#15244C"} strokeWidth={t.year ? 2 : 1} />
              <text x={X(t.day) + 6} y={AXIS_Y - 10} fontSize={16} fontWeight={500} fill="#8FA2CF">{monthShort(ymd(t.day).m)}</text>
              {t.year && <text x={X(t.day) + 6} y={AXIS_Y - 36} fontSize={23} fontWeight={800} fill="#FFFFFF">{t.label}</text>}
            </g>
          ))}
          {rows.map((r, i) => {
            const y = ROW_Y + i * ROW_H
            const it = r.it
            if (!it) return null
            const st = barStyle(it.certainty)
            const isVig = r.key === "vig"
            const color = isVig ? "#FF7A1A" : r.key.startsWith("t1b") || r.key === "t2b" ? "#BFD3FF" : r.key === "op" ? "#8FA2CF" : r.key === "plan" ? "#8EA2D6" : r.key === "t2" ? "#A78BFA" : "#2EA8FF"
            const over = overruns.find((o) => o.item.id === it.id)
            const x1 = X(it.range.start)
            const x2 = X(it.range.end)
            const glow = (step === 1 && isVig) || (step >= 5 && r.key === "t1") || (step >= 6 && r.key === "t1b")
            return (
              <motion.g key={r.key} animate={{ opacity: dimRow(r.key) ? 0.25 : 1 }} transition={{ duration: 0.4 }}>
                {glow && <rect x={x1} y={y + 8} width={Math.max(4, x2 - x1)} height={ROW_H - 18} rx={12} fill={color} opacity={0.55} filter="url(#s3-glow)" />}
                <rect x={x1} y={y + 8} width={Math.max(4, x2 - x1)} height={ROW_H - 18} rx={12} fill={color} fillOpacity={st.fillOpacity} stroke={color} strokeOpacity={st.strokeOpacity || 0} strokeWidth={3} strokeDasharray={st.dash?.split(" ").map((n) => +n * 1.6).join(" ")} />
                {over && (
                  <rect x={X(over.after.start)} y={y + 8} width={Math.max(4, X(over.after.end) - X(over.after.start))} height={ROW_H - 18} rx={12} fill="url(#s3-after)" stroke="#FF7A1A" strokeWidth={step >= 5 && (r.key === "t1" || (step >= 6 && r.key === "t1b")) ? 4 : 2} />
                )}
                <text x={Math.max(x1, PLOT_X) + 16} y={y + ROW_H / 2 + 6} fontSize={18} fontWeight={700} fill={st.fillOpacity > 0.5 ? "#06122E" : "#EEF3FF"}>
                  {fmtDate(it.start, "month")} – {fmtDate(it.end, "month")}
                  {it.certainty === "hipotese" ? "  · hipótese" : it.changed ? "  · Δ cenário" : ""}
                </text>
                {over && X(over.after.end) - X(over.after.start) > 70 && (
                  <text x={X(over.after.end) - 12} y={y + ROW_H / 2 + 6} fontSize={18} fontWeight={800} fill="#FFFFFF" textAnchor="end">+{over.months} m</text>
                )}
              </motion.g>
            )
          })}

          {/* Darken what came before (step 4+) */}
          {vigEnd != null && (
            <motion.rect x={PLOT_X} y={AXIS_Y - 40} height={rows.length * ROW_H + 80} fill="#020615" initial={false} animate={{ opacity: step >= 4 ? 0.62 : 0, width: Math.max(0, X(vigEnd) - PLOT_X) }} transition={{ duration: reduce ? 0 : 0.6 }} />
          )}

          {/* Markers */}
          <line x1={X(ref)} x2={X(ref)} y1={AXIS_Y} y2={ROW_Y + rows.length * ROW_H} stroke="#7FD1FF" strokeWidth={2.5} strokeDasharray="7 6" />
          {t1End != null && <line x1={X(t1End)} x2={X(t1End)} y1={AXIS_Y} y2={ROW_Y + rows.length * ROW_H} stroke="#FFFFFF" strokeWidth={2} strokeDasharray="2 5" />}
          {vigEnd != null && (
            <>
              {step === 3 && !reduce && (
                <motion.line x1={X(vigEnd)} x2={X(vigEnd)} y1={AXIS_Y} y2={ROW_Y + rows.length * ROW_H} stroke="#FF7A1A" strokeWidth={14} initial={{ opacity: 0.6 }} animate={{ opacity: [0.6, 0.1, 0.6] }} transition={{ repeat: Infinity, duration: 1.6 }} />
              )}
              <line x1={X(vigEnd)} x2={X(vigEnd)} y1={AXIS_Y - 6} y2={ROW_Y + rows.length * ROW_H} stroke="#FF7A1A" strokeWidth={4} />
            </>
          )}
        </g>

        {/* Row labels */}
        {rows.map((r, i) => (
          <g key={`l${r.key}`} opacity={dimRow(r.key) ? 0.3 : 1}>
            <text x={LABEL_X} y={ROW_Y + i * ROW_H + ROW_H / 2 + 7} fontSize={21} fontWeight={r.key === "vig" || r.key === "t1" ? 800 : 600} fill={r.it ? (r.key === "vig" ? "#FFB27A" : "#E8EEFC") : "#5F6F98"}>
              {r.label}
            </text>
            {!r.it && <text x={PLOT_X + 12} y={ROW_Y + i * ROW_H + ROW_H / 2 + 7} fontSize={17} fill="#5F6F98">não cadastrado neste cenário</text>}
          </g>
        ))}

        {/* Marker labels below the chart */}
        <g fontSize={17} fontWeight={700}>
          {X(ref) >= PLOT_X && X(ref) <= PLOT_X + PLOT_W && (
            <text x={cx(X(ref)) > 0 ? X(ref) - 8 : 0} y={ROW_Y + rows.length * ROW_H + 30} textAnchor="end" fill="#7FD1FF" dy={-2}>Referência {fmtDate(doc.settings.referenceDate)}</text>
          )}
          {vigEnd != null && X(vigEnd) <= PLOT_X + PLOT_W && (
            <text x={X(vigEnd) + 10} y={ROW_Y + rows.length * ROW_H + 28} fill="#FFB27A">Fim da vigência {fmtDate(fromDay(vigEnd - 1))} · a validar</text>
          )}
          {t1End != null && X(t1End) <= PLOT_X + PLOT_W && (
            <text x={X(t1End) > PLOT_X + PLOT_W - 420 ? X(t1End) - 10 : X(t1End) + 10} textAnchor={X(t1End) > PLOT_X + PLOT_W - 420 ? "end" : "start"} y={ROW_Y + rows.length * ROW_H + 54} fill="#FFFFFF">Fim previsto {t1?.name} · {fmtDate(fromDay(t1End - 1), "month")}</text>
          )}
        </g>
        {vigEnd != null && X(vigEnd) < PLOT_X + PLOT_W - 140 && (
          <text x={X(vigEnd) + 14} y={AXIS_Y + 26} fontSize={15} fontWeight={800} letterSpacing={2.5} fill="#FFB27A">APÓS A VIGÊNCIA DE REFERÊNCIA</text>
        )}

        {/* Step 3: the milestone, large */}
        <AnimatePresence>
          {step >= 3 && vigEnd != null && (
            <motion.g key="m" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <rect x={X(vigEnd) + 14} y={ROW_Y + 6 * ROW_H + 4} width={250} height={48} rx={12} fill="#FF7A1A" />
              <text x={X(vigEnd) + 139} y={ROW_Y + 6 * ROW_H + 38} fontSize={28} fontWeight={800} fill="#1A0B00" textAnchor="middle">{fmtDate(fromDay(vigEnd - 1))}</text>
            </motion.g>
          )}
          {/* Step 7: calendar-month bracket */}
          {step >= 7 && t1Over && (
            <motion.g key="b" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <path d={`M${X(t1Over.after.start)},${ROW_Y + 2 * ROW_H - 2} v-14 H${X(t1Over.after.end)} v14`} stroke="#FFFFFF" strokeWidth={3} fill="none" />
              <rect x={Math.min(PLOT_X + PLOT_W - 560, (X(t1Over.after.start) + X(t1Over.after.end)) / 2 - 280)} y={ROW_Y + 2 * ROW_H - 72} width={560} height={50} rx={12} fill="#FFFFFF" />
              <text x={Math.min(PLOT_X + PLOT_W - 280, (X(t1Over.after.start) + X(t1Over.after.end)) / 2)} y={ROW_Y + 2 * ROW_H - 39} fontSize={23} fontWeight={800} fill="#0A1633" textAnchor="middle">
                {t1Over.months} meses-calendário · {fmtMonthsSpan(t1Over.after)}
              </text>
            </motion.g>
          )}
        </AnimatePresence>
      </svg>

      {/* Narrative caption */}
      <AnimatePresence mode="wait">
        {step > 0 && (
          <motion.div key={step} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.3 }}
            className="absolute right-[120px] bottom-[66px] left-[120px] rounded-xl border border-white/10 bg-[#081538]/95 px-6 py-3 text-[24px] font-semibold text-white">
            {CAPTIONS[step]}
            {step === 5 && t1Over && <span className="text-[#7FD1FF]"> Trecho restante: {fmtMonthsSpan(t1Over.after)}.</span>}
            {step === 6 && grantsOver && <span className="text-[#BFD3FF]"> Período registrado ≠ bolsa devida.</span>}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Step 8: needs for analysis and decision, over the dimmed past */}
      <AnimatePresence>
        {step >= 8 && (
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="absolute top-[480px] left-[440px] w-[560px] rounded-2xl border-2 border-[#FF7A1A]/70 bg-[#0A1336]/95 p-6">
            <div className="text-[16px] font-bold tracking-[0.18em] text-[#FFB27A] uppercase">Necessidades de análise e decisão</div>
            <ul className="mt-3 space-y-2 text-[20px] leading-snug text-white">
              {decisions.map((d) => <li key={d.id}>→ {d.title}</li>)}
            </ul>
            <p className="mt-3 text-[15px] leading-snug text-[#8FA2CF]">Continuidade temporal ≠ cobertura financeira ≠ situação contratual. Este quadro não constitui conclusão jurídica.</p>
          </motion.div>
        )}
      </AnimatePresence>

      {step === 0 && (
        <Movable k="s2:note" x={120} y={962} w={1680}>
          <p className="text-[17px] leading-snug text-[#8FA2CF]">Meses-calendário indicam continuidade temporal — não despesas irregulares, ausência de cobertura nem cálculo proporcional. Datas de referência sujeitas à validação documental.</p>
        </Movable>
      )}
      <SceneNotes scene={2} resolveX={(n) => (n.linkedItemId ? (() => { const it = items.find((i) => i.id === n.linkedItemId); return it ? X(it.range.end) - 40 : null })() : null)} />
    </div>
  )
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub: string; tone: "orange" | "blue" | "ice" }) {
  const c = tone === "orange" ? "#FF7A1A" : tone === "blue" ? "#2EA8FF" : "#BFD3FF"
  return (
    <div className="rounded-2xl border-2 bg-[#081538]/80 px-6 py-4" style={{ borderColor: `${c}88` }}>
      <div className="truncate text-[17px] font-semibold text-[#AFC0E6]">{label}</div>
      <div className="mt-0.5 font-mono text-[44px] leading-tight font-bold" style={{ color: c }}>{value}</div>
      <div className="truncate text-[16px] text-[#8FA2CF]">{sub}</div>
    </div>
  )
}
