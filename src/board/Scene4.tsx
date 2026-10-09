import { useMemo, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { Quote } from "lucide-react"
import { cn } from "@/lib/utils"
import { dayOf, fmtDate, fmtMonthsSpan, fromDay } from "@/lib/dates"
import { summarizeScenario } from "@/lib/analysis"
import { C } from "@/lib/visual"
import type { Decision } from "@/data/types"
import { useStudio } from "@/store/store"
import { Movable, SceneNotes, SceneTitle } from "./Stage"
import { stageScale } from "./common"

const NEXT: Record<Decision["status"], Decision["status"]> = { pendente: "em_analise", em_analise: "decidido", decidido: "pendente" }
const STATUS_LABEL: Record<Decision["status"], string> = { pendente: "Pendente", em_analise: "Em análise", decidido: "Decidido" }

/** Scene 4 — pending decisions and the alternatives for Projeto 3, as time impact only. */
export function Scene4() {
  const doc = useStudio((s) => s.doc)
  const scenarioId = useStudio((s) => s.scenarioId)
  const setScenario = useStudio((s) => s.setScenario)
  const [closing, setClosing] = useState(false)
  const summaries = useMemo(() => doc.scenarios.map((s) => summarizeScenario(doc, s.id, doc.presentation.highlightCourseIds[0] ?? "t1")), [doc])
  const d0 = dayOf(2025, 1)
  const d1 = dayOf(2032, 1)
  const MW = 470
  const baseVigEnd = summaries.find((s) => s.scenario.kind === "baseline")?.vigEnd ?? null
  const { X } = stageScale(d0, d1, 0, MW)
  const p3color = doc.projects.find((p) => p.id === "p3")?.color ?? C.navy

  const cycleDecision = (d: Decision) =>
    useStudio.getState().commit("status da decisão", (x) => ({ ...x, decisions: x.decisions.map((y) => (y.id === d.id ? { ...y, status: NEXT[d.status] } : y)) }))

  return (
    <div className="absolute inset-0">
      <SceneTitle scene={3} eyebrow="Decisões para o próximo ciclo" title="Como garantir a continuidade da jornada?" size={62} />

      <Movable k="s3:decisions" x={120} y={236} w={700}>
        <div>
          <div className="text-[18px] font-bold tracking-[0.12em] text-[#C83C3C] uppercase">O que precisa ser decidido</div>
          <ul className="mt-4 divide-y divide-[#DFE6EE] border-y border-[#DFE6EE]">
            {doc.decisions.map((d) => (
              <li key={d.id}>
                <button onClick={() => cycleDecision(d)} className="flex w-full items-start gap-4 py-3.5 text-left hover:bg-[#F6F8FB]" title="Clique para atualizar o status">
                  <span className={cn("mt-1 w-[108px] shrink-0 rounded-full border-2 py-0.5 text-center text-[14px] font-bold",
                    d.status === "decidido" ? "border-[#23845D] text-[#23845D]" : d.status === "em_analise" ? "border-[#B7791F] text-[#8A5A10]" : "border-[#C83C3C] text-[#C83C3C]")}>
                    {STATUS_LABEL[d.status]}
                  </span>
                  <span className={cn("text-[21px] leading-snug text-[#18324A]", d.status === "decidido" && "text-[#8796A8] line-through")}>{d.title}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </Movable>

      <Movable k="s3:compare" x={900} y={236} w={900}>
        <div>
          <div className="text-[18px] font-bold tracking-[0.12em] text-[#087CB8] uppercase">Alternativas de continuidade</div>
          <div className="mt-4 space-y-3">
            {summaries.map((s) => {
              const active = s.scenario.id === scenarioId
              const base = s.scenario.kind === "baseline"
              const simulated = !base && s.vigEnd !== baseVigEnd
              return (
                <button
                  key={s.scenario.id}
                  onClick={() => setScenario(s.scenario.id)}
                  className={cn("block w-full rounded-lg border-2 px-4 py-3 text-left", active ? "border-[#087CB8] bg-[#F2F8FC]" : "border-[#DFE6EE] hover:border-[#B6C2D0]")}
                >
                  <div className="flex items-center gap-3">
                    <span className={cn("rounded px-2 py-0.5 text-[13px] font-bold tracking-wider", base ? "bg-[#E6EBF1] text-[#18324A]" : "bg-[#173B63] text-white")}>{base ? "BASE" : "CENÁRIO"}</span>
                    <span className="truncate text-[21px] font-bold text-[#18324A]">{s.scenario.name}</span>
                    {active && <span className="ml-auto shrink-0 text-[15px] font-semibold text-[#087CB8]">em exibição</span>}
                  </div>
                  <div className="mt-2 flex items-center gap-5">
                    <svg width={MW} height={44} aria-hidden="true" className="shrink-0">
                      {Array.from({ length: 7 }, (_, i) => 2025 + i).map((y) => (
                        <g key={y}>
                          <line x1={X(dayOf(y, 1))} x2={X(dayOf(y, 1))} y1={0} y2={44} stroke="#DFE6EE" />
                          <text x={X(dayOf(y, 1)) + 4} y={42} fontSize={12} fill="#8796A8">{y}</text>
                        </g>
                      ))}
                      {s.vigEnd != null && <rect x={X(d0)} y={4} width={X(s.vigEnd) - X(d0)} height={12} rx={2} fill={simulated ? "#FFFFFF" : C.navy} stroke={C.navy} strokeWidth={simulated ? 2 : 0} strokeDasharray={simulated ? "5 3" : undefined} />}
                      {s.t1After && <rect x={X(s.t1After.after.start)} y={4} width={X(s.t1After.after.end) - X(s.t1After.after.start)} height={12} rx={2} fill={C.red} />}
                      {s.p3 && <rect x={X(s.p3.range.start)} y={20} width={Math.min(MW, X(s.p3.range.end)) - X(s.p3.range.start)} height={12} rx={2} fill="#FFFFFF" stroke={p3color} strokeWidth={2} strokeDasharray="5 3" />}
                      {s.vigEnd != null && <line x1={X(s.vigEnd)} x2={X(s.vigEnd)} y1={0} y2={34} stroke={simulated ? C.navy : C.red} strokeWidth={2.5} strokeDasharray={simulated ? "4 3" : undefined} />}
                    </svg>
                    <div className="min-w-0 flex-1 text-[16px] leading-snug whitespace-nowrap text-[#18324A]">
                      <div>Vigência até <b>{s.vigEnd != null ? fmtDate(fromDay(s.vigEnd - 1)) : "—"}</b>{simulated && " (simulada)"}</div>
                      <div className={s.t1After ? "font-semibold text-[#C83C3C]" : "text-[#64748B]"}>{s.t1After ? `Técnico 1: ${s.t1After.months} meses após · ${fmtMonthsSpan(s.t1After.after)}` : "Técnico 1 dentro da vigência"}</div>
                      <div className="text-[#64748B]">P3 (proposta) a partir de {s.p3 ? fmtDate(s.p3.start, "month") : "—"}</div>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
          <p className="mt-3 text-[15px] leading-snug text-[#64748B]">Impacto temporal calculado de cada cenário. Nenhum cenário presume aprovação jurídica ou orçamentária; o Projeto 3 continua proposta.</p>
        </div>
      </Movable>

      <Movable k="s3:closing" x={120} y={968} w={1680}>
        <button className="flex items-start gap-3 text-left" onClick={() => setClosing(true)}>
          <Quote className="mt-1 size-7 shrink-0 text-[#087CB8]" />
          <span className="text-[25px] leading-snug font-semibold text-[#18324A]">O desafio não é apenas iniciar novos projetos, mas garantir coerência entre o tempo da formação e o tempo de execução dos recursos.</span>
        </button>
      </Movable>

      <AnimatePresence>
        {closing && (
          <motion.button
            className="absolute inset-0 z-30 flex flex-col items-start justify-center bg-white px-[160px] text-left"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }}
            onClick={() => setClosing(false)}
          >
            <span className="mb-8 h-1.5 w-40 rounded-full bg-[#C83C3C]" />
            <span className="font-display text-[72px] leading-[1.08] font-extrabold tracking-[-0.02em] text-[#18324A]">
              O desafio não é apenas iniciar novos projetos, mas garantir <span className="text-[#087CB8]">coerência</span> entre o tempo da formação e o tempo de execução dos recursos.
            </span>
            <span className="mt-10 text-[24px] text-[#64748B]">SKA Tech Hub · Projetos 1, 2 e 3</span>
          </motion.button>
        )}
      </AnimatePresence>
      <SceneNotes scene={3} />
    </div>
  )
}
