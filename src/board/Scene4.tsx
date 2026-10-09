import { useMemo, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { CheckCircle2, CircleDashed, Clock3, Quote } from "lucide-react"
import { cn } from "@/lib/utils"
import { fmtDate, fmtMonthsSpan, fromDay, toDay } from "@/lib/dates"
import { summarizeScenario } from "@/lib/analysis"
import type { Decision } from "@/data/types"
import { useStudio } from "@/store/store"
import { useAnalysis } from "@/store/hooks"
import { Movable, SceneNotes, SceneTitle } from "./Stage"
import { StatusTag } from "./common"

const NEXT: Record<Decision["status"], Decision["status"]> = { pendente: "em_analise", em_analise: "decidido", decidido: "pendente" }
const STATUS_LABEL: Record<Decision["status"], string> = { pendente: "Pendente", em_analise: "Em análise", decidido: "Decidido" }

export function Scene4() {
  const doc = useStudio((s) => s.doc)
  const scenarioId = useStudio((s) => s.scenarioId)
  const setScenario = useStudio((s) => s.setScenario)
  const { items } = useAnalysis()
  const ref = toDay(doc.settings.referenceDate)
  const [closing, setClosing] = useState(false)

  const doneAll = items.filter((i) => i.range.end <= ref && i.certainty !== "hipotese" && i.kind !== "planejamento")
  const done = doneAll.slice(0, 4)
  const running = items.filter((i) => i.range.start <= ref && i.range.end > ref && i.certainty !== "hipotese" && ["curso", "bolsa", "operacao", "vigencia", "turma", "atividade"].includes(i.kind))
  const proven = done.filter((i) => i.certainty === "comprovado" || i.certainty === "executado").length
  const summaries = useMemo(() => doc.scenarios.map((s) => summarizeScenario(doc, s.id, doc.presentation.highlightCourseIds[0] ?? "t1")), [doc])

  const cycleDecision = (d: Decision) =>
    useStudio.getState().commit("status da decisão", (x) => ({ ...x, decisions: x.decisions.map((y) => (y.id === d.id ? { ...y, status: NEXT[d.status] } : y)) }))

  return (
    <div className="absolute inset-0">
      <SceneTitle scene={3} eyebrow="Decisões para o próximo ciclo" title="Como garantir a continuidade da jornada?" />

      <div className="absolute top-[236px] left-[120px] grid w-[1680px] grid-cols-3 gap-6">
        <Column icon={<CheckCircle2 className="size-7 text-[#7FD1FF]" />} title="O que foi realizado" sub={proven ? `${proven} comprovado(s)` : "registros a comprovar documentalmente"}>
          {done.map((i) => (
            <Line key={i.id} title={i.name} meta={i.dateUndetermined ? `período geral ${i.start.slice(0, 4)}–${i.end.slice(0, 4)}` : fmtDate(i.end, i.precision)} tag={<StatusTag c={i.certainty} className="!text-[13px]" />} />
          ))}
          {doneAll.length > done.length && <div className="px-2 text-[15px] text-[#8FA2CF]">+ {doneAll.length - done.length} registro(s) no Estúdio</div>}
        </Column>
        <Column icon={<Clock3 className="size-7 text-[#2EA8FF]" />} title="O que permanece em execução" sub={`em ${fmtDate(doc.settings.referenceDate)}`}>
          {running.map((i) => (
            <Line key={i.id} title={i.name} meta={`até ${fmtDate(i.end, "month")}`} tag={<StatusTag c={i.certainty} className="!text-[13px]" />} />
          ))}
        </Column>
        <Column icon={<CircleDashed className="size-7 text-[#FF7A1A]" />} title="O que precisa ser decidido" sub="clique para atualizar o status">
          {doc.decisions.map((d) => (
            <button key={d.id} onClick={() => cycleDecision(d)} className="flex w-full items-start gap-3 rounded-lg px-2 py-1 text-left hover:bg-white/5">
              <span className={cn("mt-1 shrink-0 rounded-full border-2 px-2.5 text-[13px] font-bold", d.status === "decidido" ? "border-[#7FD1FF] text-[#7FD1FF]" : d.status === "em_analise" ? "border-[#FFD08A] text-[#FFD08A]" : "border-[#FF7A1A] text-[#FFB27A]")}>
                {STATUS_LABEL[d.status]}
              </span>
              <span className={cn("text-[18px] leading-snug text-white", d.status === "decidido" && "text-[#8FA2CF] line-through")}>{d.title}</span>
            </button>
          ))}
        </Column>
      </div>

      {/* Scenario comparison — impact in time only */}
      <Movable k="s3:compare" x={120} y={664} w={1680}>
        <div className="rounded-2xl border border-white/10 bg-[#081538]/85">
          <div className="grid grid-cols-[1.6fr_1fr_1.3fr_1fr_1.25fr_0.6fr] gap-4 border-b border-white/10 px-6 py-3 text-[15px] font-bold tracking-[0.12em] text-[#7FD1FF] uppercase">
            <span>Cenário de continuidade</span><span>Fim da vigência P2</span><span>Formação após a vigência</span><span>Início do P3</span><span>Vigência P2 → P3</span><span />
          </div>
          {summaries.map((s) => {
            const active = s.scenario.id === scenarioId
            const gap = s.gapToP3
            return (
              <div key={s.scenario.id} className={cn("grid grid-cols-[1.6fr_1fr_1.3fr_1fr_1.25fr_0.6fr] items-center gap-4 px-6 py-3 text-[19px]", active && "bg-[#2EA8FF]/10")}>
                <span className="flex min-w-0 items-center gap-2 font-semibold text-white">
                  <span className={cn("rounded px-2 py-0.5 text-[12px] font-bold", s.scenario.kind === "baseline" ? "bg-white/15" : "bg-[#C4B5FD] text-[#1B1240]")}>{s.scenario.kind === "baseline" ? "BASE" : "HIPÓTESE"}</span>
                  <span className="min-w-0 truncate" title={s.scenario.name}>{s.scenario.name}</span>
                </span>
                <span className="font-mono">{s.vigEnd != null ? fmtDate(fromDay(s.vigEnd - 1)) : "—"}</span>
                <span className={s.t1After ? "font-semibold text-[#FFB27A]" : "text-[#8FA2CF]"}>{s.t1After ? `${s.t1After.months} m · ${fmtMonthsSpan(s.t1After.after)}` : "dentro da vigência"}</span>
                <span className="font-mono">{s.p3 ? fmtDate(s.p3.start, "month") : "—"}</span>
                <span className={gap != null && gap > 0 ? "text-[#FFB27A]" : "text-[#AFC0E6]"}>
                  {gap == null ? "—" : gap > 0 ? `intervalo de ${gap} dias` : gap === 0 ? "contíguo" : `sobreposição de ${-gap} dias`}
                </span>
                <span className="text-right">
                  {active ? <span className="text-[15px] font-semibold text-[#7FD1FF]">em exibição</span> : (
                    <button className="rounded-full border border-white/25 px-3 py-1 text-[15px] hover:bg-white/10" onClick={() => setScenario(s.scenario.id)}>Exibir</button>
                  )}
                </span>
              </div>
            )
          })}
          <div className="border-t border-white/10 px-6 py-2.5 text-[15px] text-[#8FA2CF]">
            Impacto temporal calculado dos registros de cada cenário. Nenhum cenário presume aprovação jurídica ou orçamentária; hipóteses do P3 não são vigência.
          </div>
        </div>
      </Movable>

      <Movable k="s3:closing" x={120} y={928} w={1680}>
        <button className="flex items-start gap-3 text-left" onClick={() => setClosing(true)}>
          <Quote className="mt-1 size-7 shrink-0 text-[#FF7A1A]" />
          <span className="text-[24px] leading-snug font-semibold text-white/90">O desafio não é apenas iniciar novos projetos, mas garantir coerência entre o tempo da formação e o tempo de execução dos recursos.</span>
        </button>
      </Movable>

      <AnimatePresence>
        {closing && (
          <motion.button
            className="absolute inset-0 z-30 flex flex-col items-start justify-center bg-[#030817]/95 px-[160px] text-left"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.6 }}
            onClick={() => setClosing(false)}
          >
            <span className="mb-8 h-1.5 w-40 rounded-full bg-[#FF7A1A]" />
            <span className="text-[76px] leading-[1.08] font-bold tracking-[-0.02em] text-white">
              O desafio não é apenas iniciar novos projetos, mas garantir <span className="text-[#2EA8FF]">coerência</span> entre o tempo da formação e o tempo de execução dos recursos.
            </span>
            <span className="mt-10 text-[24px] text-[#8FA2CF]">SKA Tech Hub · Projetos 1, 2 e 3</span>
          </motion.button>
        )}
      </AnimatePresence>
      <SceneNotes scene={3} />
    </div>
  )
}

function Column({ icon, title, sub, children }: { icon: React.ReactNode; title: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="h-[404px] overflow-hidden rounded-2xl border border-white/10 bg-[#081538]/80 p-5">
      <div className="flex items-center gap-3">
        {icon}
        <div>
          <div className="text-[25px] leading-tight font-bold text-white">{title}</div>
          <div className="text-[15px] text-[#8FA2CF]">{sub}</div>
        </div>
      </div>
      <div className="mt-3 space-y-1">{children}</div>
    </div>
  )
}

function Line({ title, meta, tag }: { title: string; meta: string; tag: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-2 py-1.5">
      <div className="min-w-0 flex-1">
        <div className="truncate text-[19px] font-semibold text-white">{title}</div>
        <div className="text-[15px] text-[#8FA2CF]">{meta}</div>
      </div>
      {tag}
    </div>
  )
}
