import { useState } from "react"
import { motion } from "motion/react"
import { calendarMonthsTouched, dayOf, fmtDate, fmtMonthsSpan, fromDay, partAfter, toDay } from "@/lib/dates"
import { C } from "@/lib/visual"
import { useStudio } from "@/store/store"
import { useAnalysis } from "@/store/hooks"
import { Movable, SceneNotes, SceneTitle } from "./Stage"
import { StageAxis, StatusTag, stageScale } from "./common"

const PLOT_X = 120
const PLOT_W = 1680
const AXIS_Y = 290
const BAND_Y = [420, 520, 620]
const BAND_H = 64

/** Scene 1 — the three cycles on one clean, linear time axis. */
export function Scene1() {
  const doc = useStudio((s) => s.doc)
  const { items } = useAnalysis()
  const [focus, setFocus] = useState<string | null>(null)
  const { start: y0, end: y1 } = doc.settings.boardRange
  const d0 = dayOf(y0, 1)
  const d1 = dayOf(y1 + 1, 1)
  const { X } = stageScale(d0, d1, PLOT_X, PLOT_W)
  const ref = toDay(doc.settings.referenceDate)

  const cycles = doc.projects
    .map((p, i) => ({ p, bar: items.find((it) => it.kind === "projeto" && it.projectId === p.id), level: i }))
    .filter((c) => c.bar)
  const vig = items.find((i) => i.kind === "vigencia" && i.projectId === "p2")
  const docVig = vig ? (vig.baseRange ?? vig.range) : null
  const focusCycle = cycles.find((c) => c.p.id === focus)
  const bottom = BAND_Y[Math.min(2, cycles.length - 1)] + BAND_H + 24

  return (
    <div className="absolute inset-0" onClick={() => setFocus(null)}>
      <SceneTitle scene={0} eyebrow="A evolução do SKA Tech Hub" title="Uma jornada construída em diferentes ciclos" size={62} sub="Projetos sucessivos que se sobrepõem e se conectam. Clique em um ciclo para destacá-lo." />

      <svg className="pointer-events-none absolute inset-0" width={1920} height={1080} aria-hidden="true">
        <StageAxis d0={d0} d1={d1} X={X} y={AXIS_Y} months={false} />
        {Array.from({ length: y1 - y0 + 2 }, (_, i) => y0 + i).map((y) => (
          <line key={y} x1={X(dayOf(y, 1))} x2={X(dayOf(y, 1))} y1={AXIS_Y + 80} y2={bottom} stroke="#DFE6EE" />
        ))}
        {docVig && (
          <g opacity={focus && focus !== "p2" ? 0.3 : 1}>
            <rect x={X(docVig.end)} y={AXIS_Y + 80} width={Math.max(0, PLOT_X + PLOT_W - X(docVig.end))} height={bottom - AXIS_Y - 80} fill={C.redSoft} />
            <line x1={X(docVig.end)} x2={X(docVig.end)} y1={AXIS_Y + 80} y2={bottom} stroke={C.red} strokeWidth={4} />
            <text x={X(docVig.end) + 10} y={bottom + 28} fontSize={18} fontWeight={700} fill={C.red}>↑ {fmtDate(fromDay(docVig.end - 1))} · fim da vigência de referência do Projeto 2</text>
          </g>
        )}
        <line x1={X(ref)} x2={X(ref)} y1={AXIS_Y + 80} y2={bottom} stroke="#5FA548" strokeWidth={3} />
        <text x={X(ref) - 10} y={bottom + 28} fontSize={18} fontWeight={700} fill="#3E7D2C" textAnchor="end">referência {fmtDate(doc.settings.referenceDate)}</text>
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
            animate={{ opacity: dim ? 0.25 : 1 }}
            transition={{ duration: 0.3 }}
            className="absolute flex cursor-pointer items-center gap-4 rounded-[6px] px-6 text-left"
            style={{
              left: x,
              top: BAND_Y[c.level],
              width: w,
              height: BAND_H,
              background: hyp ? "#FFFFFF" : c.p.color,
              border: hyp ? `3px dashed ${c.p.color}` : undefined,
              boxShadow: isFocus ? `0 0 0 4px #FFFFFF, 0 0 0 7px ${c.p.color}` : undefined,
            }}
          >
            <span className="truncate text-[26px] font-bold" style={{ color: hyp ? c.p.color : "#FFFFFF" }}>
              {c.p.name} · {c.p.phase}
            </span>
            <span className="ml-auto shrink-0 text-[18px] font-semibold" style={{ color: hyp ? c.p.color : "rgba(255,255,255,0.88)" }}>
              {bar.precision === "year" ? `${bar.start.slice(0, 4)}–${bar.end.slice(0, 4)}` : fmtMonthsSpan(bar.range)}
            </span>
          </motion.button>
        )
      })}

      {/* Detail — reacts to focus, always derived from the records */}
      <Movable k="s0:panel" x={120} y={800} w={1680}>
        <div className="flex min-h-[150px] items-start gap-10 border-t-2 border-[#DFE6EE] pt-5" onClick={(e) => e.stopPropagation()}>
          {focusCycle ? (
            <>
              <div className="w-[420px] shrink-0">
                <div className="text-[17px] font-bold tracking-[0.14em] uppercase" style={{ color: focusCycle.p.color }}>{focusCycle.p.name}</div>
                <div className="mt-1 text-[28px] leading-tight font-bold text-[#18324A]">{focusCycle.p.phase}</div>
                <div className="mt-2"><StatusTag c={focusCycle.bar!.certainty} /></div>
              </div>
              <ul className="grid flex-1 grid-cols-2 gap-x-8 gap-y-2 text-[20px] leading-snug text-[#18324A]">
                {items
                  .filter((i) => i.projectId === focusCycle.p.id && ["curso", "atividade", "vigencia", "turma"].includes(i.kind))
                  .slice(0, 6)
                  .map((i) => {
                    const after = docVig && i.kind === "curso" && !i.dateUndetermined ? partAfter(i.range, docVig) : null
                    return (
                      <li key={i.id}>
                        <b>{i.name}</b>
                        <span className="text-[17px] text-[#64748B]"> · {i.dateUndetermined ? "data a validar" : `${fmtDate(i.start, "month")} – ${fmtDate(i.end, "month")}`}</span>
                        {after && <span className="block text-[17px] font-semibold text-[#C83C3C]">continua {calendarMonthsTouched(after)} meses após a vigência</span>}
                      </li>
                    )
                  })}
              </ul>
            </>
          ) : (
            <p className="max-w-[1300px] text-[25px] leading-snug text-[#18324A]">
              {cycles.length} ciclos entre {y0} e {y1}. A formação iniciada em um ciclo pode continuar no seguinte; o Projeto 3 é uma <b>proposta</b> (tracejado), ainda sem aprovação, valores ou vigência.
            </p>
          )}
        </div>
      </Movable>
      <SceneNotes scene={0} />
    </div>
  )
}
