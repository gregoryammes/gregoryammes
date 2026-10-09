import { useState } from "react"
import { motion } from "motion/react"
import { calendarMonthsTouched, dayOf, fmtDate, fmtMonthsSpan, fromDay, partAfter, toDay } from "@/lib/dates"
import { C } from "@/lib/visual"
import { useStudio } from "@/store/store"
import { offeringLabel, shortNameOf } from "@/lib/v6"
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
  // Expanded history: courses, actions and the vigência; consolidated programmes as one line.
  const history = focusCycle
    ? (() => {
        const own = items.filter((i) => i.projectId === focusCycle.p.id && ["curso", "atividade", "vigencia", "turma", "bolsa"].includes(i.kind) && !i.hidden)
        const cons = [...new Set(own.filter((i) => i.consolidation).map((i) => i.consolidation!))]
        const plain = own.filter((i) => !i.consolidation && i.kind !== "bolsa").map((i) => ({ ...i, label: i.kind === "curso" ? offeringLabel(doc, i, false) : shortNameOf(i) }))
        const grouped = cons.map((key) => {
          const m = own.filter((i) => i.consolidation === key)
          const range = { start: Math.min(...m.map((x) => x.range.start)), end: Math.max(...m.map((x) => x.range.end)) }
          return { ...m[0], id: `cons-${key}`, range, label: (doc.consolidations ?? []).find((c) => c.id === key)?.name ?? key, kind: "bolsa" as const, dateUndetermined: false }
        })
        return [...plain, ...grouped].sort((a, b) => a.range.start - b.range.start).slice(0, 6)
      })()
    : []
  const bottom = BAND_Y[Math.min(2, cycles.length - 1)] + BAND_H + 24

  return (
    <div className="absolute inset-0" onClick={() => setFocus(null)}>
      <SceneTitle scene={0} eyebrow="Evolução dos Projetos" title="Uma jornada construída em diferentes ciclos" size={62} sub="Projetos sucessivos que se sobrepõem e se conectam. Clique em um ciclo para destacá-lo." />

      <svg className="pointer-events-none absolute inset-0" width={1920} height={1080} aria-hidden="true">
        <StageAxis d0={d0} d1={d1} X={X} y={AXIS_Y} months={false} />
        {Array.from({ length: y1 - y0 + 2 }, (_, i) => y0 + i).map((y) => (
          <line key={y} x1={X(dayOf(y, 1))} x2={X(dayOf(y, 1))} y1={AXIS_Y + 80} y2={bottom} stroke="#DFE6EE" />
        ))}
        {docVig && (
          <g opacity={focus && focus !== "p2" ? 0.3 : 1}>
            <rect x={X(docVig.end)} y={AXIS_Y + 80} width={Math.max(0, PLOT_X + PLOT_W - X(docVig.end))} height={bottom - AXIS_Y - 80} fill={C.afterSoft} />
            <line x1={X(docVig.end)} x2={X(docVig.end)} y1={AXIS_Y + 80} y2={bottom} stroke={C.vigLine} strokeWidth={4} />
            <text x={X(docVig.end) + 10} y={bottom + 28} fontSize={18} fontWeight={700} fill={C.vigLine}>↑ {fmtDate(fromDay(docVig.end - 1))} · fim da vigência de referência do Projeto 2</text>
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
      {focusCycle ? (
        <div className="absolute inset-x-0 top-[744px]" onClick={(e) => e.stopPropagation()}>
          <div className="ml-[120px] flex items-center gap-4">
            <span className="text-[17px] font-bold tracking-[0.14em] uppercase" style={{ color: focusCycle.p.color }}>{focusCycle.p.name}</span>
            <span className="text-[24px] font-bold text-[#18324A]">{focusCycle.p.phase}</span>
            <StatusTag c={focusCycle.bar!.certainty} />
            <span className="text-[16px] text-[#64748B]">história do projeto no mesmo eixo · clique de novo para recolher</span>
          </div>
          {/* The project's history, expanded on the same axis as the bands above */}
          <svg width={1920} height={Math.max(60, history.length * 32 + 8)} className="mt-3 block" aria-label={`Atividades de ${focusCycle.p.name}`}>
            {history.map((h, k) => {
              const hx1 = Math.max(PLOT_X, X(h.range.start))
              const hx2 = Math.min(PLOT_X + PLOT_W, X(h.range.end))
              const hyp = h.certainty === "hipotese"
              const after = docVig && !h.dateUndetermined && h.kind !== "vigencia" ? partAfter(h.range, docVig) : null
              const labelRight = hx2 + 10 < 1500
              return (
                <g key={h.id} transform={`translate(0,${k * 32})`}>
                  {h.dateUndetermined ? (
                    <line x1={hx1} x2={hx2} y1={13} y2={13} stroke={C.plan} strokeWidth={3} strokeDasharray="3 5" />
                  ) : (
                    <rect x={hx1} y={3} width={Math.max(4, hx2 - hx1)} height={22} rx={3} fill={hyp ? "#fff" : h.kind === "vigencia" ? C.navy : focusCycle.p.color} stroke={focusCycle.p.color} strokeWidth={hyp ? 2 : 0} strokeDasharray={hyp ? "6 4" : undefined} />
                  )}
                  {after && <rect x={X(after.start)} y={3} width={Math.min(PLOT_X + PLOT_W, X(after.end)) - X(after.start)} height={22} rx={3} fill={C.after} />}
                  <text x={labelRight ? hx2 + 10 : hx1 - 10} y={19} fontSize={16} fontWeight={600} fill={C.text} textAnchor={labelRight ? "start" : "end"}>
                    {h.label}{h.dateUndetermined ? " · data a validar" : after ? ` · continua ${calendarMonthsTouched(after)} meses após a vigência` : ""}
                  </text>
                </g>
              )
            })}
          </svg>
        </div>
      ) : (
        <Movable k="s0:panel" x={120} y={780} w={1680}>
          <p className="max-w-[1300px] border-t-2 border-[#DFE6EE] pt-5 text-[25px] leading-snug text-[#18324A]">
            {cycles.length} ciclos entre {y0} e {y1}. Clique em um projeto para expandir sua história. O Projeto 3 está <b>em modelagem</b> (tracejado), sem aprovação, valores ou vigência.
          </p>
        </Movable>
      )}
      <SceneNotes scene={0} />
    </div>
  )
}
