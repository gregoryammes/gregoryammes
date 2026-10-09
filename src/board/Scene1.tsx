import { useState } from "react"
import { motion } from "motion/react"
import { dayOf, fmtDate, fmtMonthsSpan, fromDay } from "@/lib/dates"
import { describeAfter } from "@/lib/analysis"
import { useStudio } from "@/store/store"
import { useAnalysis } from "@/store/hooks"
import { Movable, SceneNotes, SceneTitle } from "./Stage"
import { StatusTag, stageScale, yearFrac } from "./common"
import { ThreeRails } from "./ThreeRails"

const AX_X = 120
const AX_W = 1680
const AXIS_Y = 900
const LEVEL_Y = [700, 560, 420]

export function Scene1() {
  const doc = useStudio((s) => s.doc)
  const { items, overruns } = useAnalysis()
  const [focus, setFocus] = useState<string | null>(null)
  const { start: y0, end: y1 } = doc.settings.boardRange
  const d0 = dayOf(y0, 1)
  const d1 = dayOf(y1 + 1, 1)
  const { X } = stageScale(d0, d1, AX_X, AX_W)

  const cycles = doc.projects
    .map((p, i) => ({ p, bar: items.find((it) => it.kind === "projeto" && it.projectId === p.id), level: i }))
    .filter((c) => c.bar)
  const vig = items.find((i) => i.kind === "vigencia" && i.projectId === "p2")
  const focusCycle = cycles.find((c) => c.p.id === focus)
  const years: number[] = []
  for (let y = y0; y <= y1; y++) years.push(y)

  return (
    <div className="absolute inset-0" onClick={() => setFocus(null)}>
      <div className="absolute inset-x-0 top-[380px] h-[640px] opacity-45">
        <ThreeRails
          from={y0}
          to={y1 + 1}
          gate={vig ? yearFrac(vig.range.end) : null}
          focus={focus}
          spans={cycles.map((c) => ({ id: c.p.id, start: yearFrac(c.bar!.range.start), end: yearFrac(c.bar!.range.end), color: c.p.color, hypothesis: c.bar!.certainty === "hipotese", level: c.level }))}
        />
      </div>
      <SceneTitle scene={0} eyebrow="A evolução do SKA Tech Hub" title="Uma jornada construída em diferentes ciclos" sub="Projetos sucessivos que se sobrepõem e se conectam — a iniciativa evolui em ciclos, não em projetos isolados. Clique em um ciclo para destacá-lo." />

      {/* Linear, measurable axis */}
      <svg className="pointer-events-none absolute inset-0" width={1920} height={1080} aria-hidden="true">
        <defs>
          <linearGradient id="s1-axis" x1="0" x2="1">
            <stop offset="0" stopColor="#2EA8FF" stopOpacity="0" />
            <stop offset="0.08" stopColor="#2EA8FF" stopOpacity="0.8" />
            <stop offset="0.92" stopColor="#2EA8FF" stopOpacity="0.8" />
            <stop offset="1" stopColor="#2EA8FF" stopOpacity="0" />
          </linearGradient>
        </defs>
        <line x1={AX_X - 40} x2={AX_X + AX_W + 40} y1={AXIS_Y} y2={AXIS_Y} stroke="url(#s1-axis)" strokeWidth={2} />
        {years.map((y) => (
          <g key={y}>
            <line x1={X(dayOf(y, 1))} x2={X(dayOf(y, 1))} y1={AXIS_Y - 8} y2={AXIS_Y + 8} stroke="#5D7BC4" strokeWidth={2} />
            <line x1={X(dayOf(y, 1))} x2={X(dayOf(y, 1))} y1={380} y2={AXIS_Y - 8} stroke="#1A2C5C" strokeDasharray="2 6" />
            <text x={X(dayOf(y, 1)) + 10} y={AXIS_Y + 34} fontSize={24} fontWeight={700} fill="#DCE6FF">{y}</text>
          </g>
        ))}
        {/* Continuity connectors between cycles */}
        {cycles.slice(0, -1).map((c, i) => {
          const next = cycles[i + 1]
          const ax = X(next.bar!.range.start) - 4
          const ay = LEVEL_Y[c.level] + 2
          const by = LEVEL_Y[next.level] + 66
          const hyp = next.bar!.certainty === "hipotese"
          return (
            <path key={c.p.id} d={`M${ax - 60},${ay} C${ax - 10},${ay} ${ax - 40},${by + 30} ${ax + 6},${by}`} fill="none" stroke={hyp ? "#C4B5FD" : "#7FD1FF"} strokeWidth={3} strokeDasharray={hyp ? "8 7" : undefined} opacity={focus ? 0.25 : 0.9} />
          )
        })}
        {vig && (
          <g opacity={focus && focus !== "p2" ? 0.3 : 1}>
            <line x1={X(vig.range.end)} x2={X(vig.range.end)} y1={LEVEL_Y[1] - 14} y2={AXIS_Y} stroke="#FF7A1A" strokeWidth={3} />
            <text x={X(vig.range.end) + 10} y={AXIS_Y - 14} fontSize={18} fontWeight={700} fill="#FFB27A">Fim da vigência de referência · {fmtDate(vig.end)}</text>
          </g>
        )}
      </svg>

      {cycles.map((c) => {
        const bar = c.bar!
        const x = X(bar.range.start)
        const w = X(bar.range.end) - x
        const hyp = bar.certainty === "hipotese"
        const dim = focus && focus !== c.p.id
        const isFocus = focus === c.p.id
        return (
          <motion.button
            key={c.p.id}
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setFocus(isFocus ? null : c.p.id)
            }}
            animate={{ opacity: dim ? 0.28 : 1, y: isFocus ? -10 : 0 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            className="absolute cursor-pointer text-left"
            style={{ left: x, top: LEVEL_Y[c.level], width: w }}
          >
            <div
              className="relative h-[68px] rounded-[14px] px-6"
              style={{
                background: hyp ? `${c.p.color}1f` : `linear-gradient(90deg, ${c.p.color}f0, ${c.p.color}b8)`,
                border: hyp ? `3px dashed ${c.p.color}` : `2px solid ${c.p.color}`,
                boxShadow: isFocus ? `0 0 0 3px #ffffff, 0 24px 60px -10px ${c.p.color}aa` : `0 18px 40px -18px ${c.p.color}`,
              }}
            >
              <div className="flex h-full items-center gap-3">
                <span className="font-mono text-[22px] font-bold text-white/80">{c.p.short}</span>
                <span className="truncate text-[25px] font-bold text-white">{c.p.phase}</span>
              </div>
            </div>
            <div className="mt-2 flex items-center gap-3 pl-1">
              <span className="text-[18px] text-[#AFC0E6]">{bar.dateUndetermined ? "período geral" : bar.precision === "year" ? `${bar.start.slice(0, 4)}–${bar.end.slice(0, 4)}` : fmtMonthsSpan(bar.range)}</span>
              <StatusTag c={bar.certainty} />
            </div>
          </motion.button>
        )
      })}

      {/* Detail panel — reacts to focus, always derived from the records */}
      <Movable k="s0:panel" x={1240} y={610} w={560}>
        <div className="rounded-2xl border border-white/10 bg-[#081538]/85 p-6 backdrop-blur-sm" onClick={(e) => e.stopPropagation()}>
          {focusCycle ? (
            <>
              <div className="text-[16px] font-semibold tracking-[0.18em] uppercase" style={{ color: focusCycle.p.color }}>{focusCycle.p.name}</div>
              <div className="mt-1 text-[26px] leading-tight font-bold text-white">{focusCycle.p.phase}</div>
              <ul className="mt-3 space-y-1.5 text-[19px] leading-snug text-[#D5DFF7]">
                {items
                  .filter((i) => i.projectId === focusCycle.p.id && ["curso", "atividade", "vigencia", "operacao"].includes(i.kind))
                  .slice(0, 6)
                  .map((i) => {
                    const o = overruns.find((x) => x.item.id === i.id)
                    return (
                      <li key={i.id} className="flex items-baseline gap-2">
                        <span className="mt-2 size-2 shrink-0 rounded-full" style={{ background: i.kind === "vigencia" ? "#FF7A1A" : focusCycle.p.color }} />
                        <span>
                          {i.name}
                          <span className="text-[16px] text-[#8FA2CF]"> · {i.dateUndetermined ? "datas não comprovadas" : `${fmtDate(i.start, "month")}–${fmtDate(i.end, "month")}`}</span>
                          {o && <span className="block text-[16px] font-semibold text-[#FFB27A]">continua {describeAfter(o)} após a vigência</span>}
                        </span>
                      </li>
                    )
                  })}
              </ul>
              {focusCycle.bar!.certainty === "hipotese" && <p className="mt-3 text-[16px] text-[#C4B5FD]">Proposta em desenvolvimento: aprovação, valores e vigência não presumidos.</p>}
            </>
          ) : (
            <>
              <div className="text-[16px] font-semibold tracking-[0.18em] text-[#7FD1FF] uppercase">Ciclos sucessivos</div>
              <p className="mt-2 text-[22px] leading-snug text-white">
                {cycles.length} ciclos entre {y0} e {y1}. A formação iniciada em um ciclo pode continuar no seguinte.
              </p>
              <p className="mt-3 text-[17px] leading-snug text-[#8FA2CF]">Datas gerais de referência, sujeitas à validação documental. Sólido = registrado · tracejado = proposta.</p>
            </>
          )}
        </div>
      </Movable>
      <SceneNotes scene={0} />
      {vig && <span className="sr-only">Vigência de referência termina em {fmtDate(fromDay(vig.range.end - 1))}</span>}
    </div>
  )
}
