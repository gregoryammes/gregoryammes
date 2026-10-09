import { useMemo, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { Quote } from "lucide-react"
import { cn } from "@/lib/utils"
import { calendarMonthsTouched, dayOf, fmtDate, fmtMonthsSpan, fromDay, partAfter } from "@/lib/dates"
import { summarizeScenario } from "@/lib/analysis"
import { C } from "@/lib/visual"
import { docVigRange, offeringLabel, shortNameOf } from "@/lib/v6"
import { FIN_LABEL, type Decision } from "@/data/types"
import { useStudio } from "@/store/store"
import { useAnalysis } from "@/store/hooks"
import { Movable, SceneNotes, SceneTitle } from "./Stage"
import { stageScale } from "./common"

const NEXT: Record<Decision["status"], Decision["status"]> = { pendente: "em_analise", em_analise: "decidido", decidido: "pendente" }
const STATUS_LABEL: Record<Decision["status"], string> = { pendente: "Pendente", em_analise: "Em análise", decidido: "Decidido" }

function H({ children, tone }: { children: React.ReactNode; tone: "after" | "blue" | "navy" }) {
  return (
    <div className={cn("text-[16px] font-bold tracking-[0.12em] uppercase", tone === "after" ? "text-[#9A4A08]" : tone === "blue" ? "text-[#087CB8]" : "text-[#173B63]")}>{children}</div>
  )
}

/** Scene 4 — what continues, what must be validated or decided, and the Projeto 3 alternatives. */
export function Scene4() {
  const doc = useStudio((s) => s.doc)
  const scenarioId = useStudio((s) => s.scenarioId)
  const setScenario = useStudio((s) => s.setScenario)
  const { items } = useAnalysis()
  const [closing, setClosing] = useState(false)
  const summaries = useMemo(() => doc.scenarios.map((s) => summarizeScenario(doc, s.id, doc.presentation.highlightCourseIds[0] ?? "t1")), [doc])
  const vig = docVigRange(doc)
  const d0 = dayOf(2025, 1)
  const d1 = dayOf(2032, 1)
  const MW = 470
  const baseVigEnd = vig?.end ?? null
  const { X } = stageScale(d0, d1, 0, MW)
  const p3color = doc.projects.find((p) => p.id === "p3")?.color ?? C.navy

  const after = (r: { start: number; end: number }) => (vig ? partAfter(r, vig) : null)
  const continuing = items.filter((i) => !i.hidden && i.kind === "curso" && after(i.range))
  const bolsas = items.filter((i) => !i.hidden && i.kind === "bolsa" && !i.consolidation && after(i.range))
  const programmes = (doc.consolidations ?? []).map((c) => ({ c, m: items.filter((i) => i.consolidation === c.id && !i.hidden) })).filter((x) => x.m.length)
  const ops = items.filter((i) => !i.hidden && i.kind === "operacao" && i.projectId === "p2" && !!vig && i.range.end <= vig.end && continuing.length > 0)
  const finQuestions = items.filter(
    (i) => !i.hidden && !i.consolidation && (i.kind === "curso" || i.kind === "bolsa") && !!after(i.range) && ["pendente", "nao_identificada", "pagamentos_condicionados"].includes(i.finSituation ?? "pendente"),
  )
  const lastCourseEnd = continuing.length ? Math.max(...continuing.map((c) => c.range.end)) : null

  const cycleDecision = (d: Decision) =>
    useStudio.getState().commit("status da decisão", (x) => ({ ...x, decisions: x.decisions.map((y) => (y.id === d.id ? { ...y, status: NEXT[d.status] } : y)) }))

  return (
    <div className="absolute inset-0">
      <SceneTitle scene={3} eyebrow="Continuidade e decisões" title="Como garantir a continuidade da jornada?" size={60} />

      <Movable k="s3:continua" x={120} y={226} w={520}>
        <div className="space-y-6">
          <div>
            <H tone="after">Continua após a vigência</H>
            <ul className="mt-2 space-y-1.5 text-[19px] leading-snug text-[#18324A]">
              {continuing.map((c) => (
                <li key={c.id}>
                  <b>{offeringLabel(doc, c, false)}</b>
                  <span className="block text-[17px] text-[#9A4A08]">{calendarMonthsTouched(after(c.range))} meses-calendário · {fmtMonthsSpan(after(c.range)!)}{c.certainty === "hipotese" ? " · cenário" : ""}</span>
                </li>
              ))}
              {continuing.length === 0 && <li className="text-[#64748B]">Nenhum curso ultrapassa a vigência de referência.</li>}
            </ul>
          </div>
          <div>
            <H tone="blue">Bolsas e compromissos relacionados</H>
            <ul className="mt-2 space-y-1.5 text-[18px] leading-snug text-[#18324A]">
              {bolsas.map((b) => (
                <li key={b.id}>{shortNameOf(b)} <span className="text-[#64748B]">· período registrado até {fmtDate(b.end, "month")}, condicionado</span></li>
              ))}
              {programmes.map(({ c, m }) => (
                <li key={c.id}>{c.name} <span className="text-[#64748B]">· {m.length} períodos · {c.subtitle?.toLowerCase() ?? "programa"}</span></li>
              ))}
            </ul>
          </div>
          {ops.length > 0 && lastCourseEnd != null && (
            <div>
              <H tone="navy">Continuidade operacional</H>
              <ul className="mt-2 space-y-1.5 text-[18px] leading-snug text-[#18324A]">
                {ops.map((o) => (
                  <li key={o.id}>{shortNameOf(o)} registrada até {fmtDate(o.end, "month")}; a formação segue até {fmtDate(fromDay(lastCourseEnd - 1), "month")}.</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </Movable>

      <Movable k="s3:decisions" x={700} y={226} w={520}>
        <div className="space-y-6">
          <div>
            <H tone="after">Questões financeiras a validar</H>
            <ul className="mt-2 space-y-1.5 text-[17px] leading-snug text-[#18324A]">
              {finQuestions.map((i) => (
                <li key={i.id}><b>{shortNameOf(i)}</b>: <span className="text-[#64748B]">{FIN_LABEL[i.finSituation ?? "pendente"]}</span></li>
              ))}
              {finQuestions.length === 0 && <li className="text-[#64748B]">Nenhuma questão financeira registrada.</li>}
            </ul>
          </div>
          <div>
            <H tone="navy">O que precisa ser decidido</H>
            <ul className="mt-2 divide-y divide-[#DFE6EE] border-y border-[#DFE6EE]">
              {doc.decisions.map((d) => (
                <li key={d.id}>
                  <button onClick={() => cycleDecision(d)} className="flex w-full items-start gap-3 py-2 text-left hover:bg-[#F6F8FB]" title="Clique para atualizar o status">
                    <span className={cn("mt-0.5 w-[100px] shrink-0 rounded-full border-2 py-0.5 text-center text-[13px] font-bold",
                      d.status === "decidido" ? "border-[#23845D] text-[#23845D]" : d.status === "em_analise" ? "border-[#B7791F] text-[#8A5A10]" : "border-[#9A4A08] text-[#9A4A08]")}>
                      {STATUS_LABEL[d.status]}
                    </span>
                    <span className={cn("text-[17px] leading-snug text-[#18324A]", d.status === "decidido" && "text-[#8796A8] line-through")}>{d.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Movable>

      <Movable k="s3:compare" x={1280} y={226} w={520}>
        <div>
          <H tone="blue">Cenários do Projeto 3</H>
          <div className="mt-3 space-y-2.5">
            {summaries.map((s) => {
              const active = s.scenario.id === scenarioId
              const base = s.scenario.kind === "baseline"
              const simulated = s.vigEnd !== baseVigEnd
              return (
                <button key={s.scenario.id} onClick={() => setScenario(s.scenario.id)}
                  className={cn("block w-full rounded-lg border-2 px-3.5 py-2.5 text-left", active ? "border-[#087CB8] bg-[#F2F8FC]" : "border-[#DFE6EE] hover:border-[#B6C2D0]")}>
                  <div className="flex items-center gap-2">
                    <span className={cn("rounded px-1.5 py-0.5 text-[12px] font-bold", base ? "bg-[#E6EBF1] text-[#18324A]" : "bg-[#173B63] text-white")}>{base ? "BASE" : "CENÁRIO"}</span>
                    <span className="truncate text-[17px] font-bold text-[#18324A]">{s.scenario.name}</span>
                  </div>
                  <svg width={MW} height={30} aria-hidden="true" className="mt-1.5">
                    {baseVigEnd != null && <rect x={X(d0)} y={2} width={X(baseVigEnd) - X(d0)} height={10} rx={2} fill={C.navy} />}
                    {simulated && baseVigEnd != null && s.vigEnd != null && <rect x={X(baseVigEnd)} y={2} width={Math.max(0, X(s.vigEnd) - X(baseVigEnd))} height={10} rx={2} fill="#fff" stroke={C.navy} strokeDasharray="4 3" />}
                    {s.t1After && <rect x={X(s.t1After.after.start)} y={2} width={X(s.t1After.after.end) - X(s.t1After.after.start)} height={10} rx={2} fill={C.after} />}
                    {s.p3 && <rect x={X(s.p3.range.start)} y={16} width={Math.min(MW, X(s.p3.range.end)) - X(s.p3.range.start)} height={10} rx={2} fill="#fff" stroke={p3color} strokeWidth={1.5} strokeDasharray="4 3" />}
                    {baseVigEnd != null && <line x1={X(baseVigEnd)} x2={X(baseVigEnd)} y1={0} y2={28} stroke={C.vigLine} strokeWidth={2} />}
                  </svg>
                  <div className="text-[14.5px] leading-snug text-[#18324A]">
                    Vigência até <b>{s.vigEnd != null ? fmtDate(fromDay(s.vigEnd - 1)) : "—"}</b>{simulated && " (hipótese)"} ·{" "}
                    <span className={s.t1After ? "font-semibold text-[#9A4A08]" : "text-[#64748B]"}>{s.t1After ? `Técnico 1 +${s.t1After.months} m` : "Técnico 1 dentro"}</span> ·{" "}
                    <span className="text-[#64748B]">P3 de {s.p3 ? fmtDate(s.p3.start, "month") : "—"}</span>
                  </div>
                </button>
              )
            })}
          </div>
          <p className="mt-2 text-[14px] leading-snug text-[#64748B]">Impacto temporal calculado. Nenhum cenário presume aprovação jurídica ou orçamentária; o Projeto 3 segue em modelagem.</p>
        </div>
      </Movable>

      <Movable k="s3:closing" x={120} y={968} w={1680}>
        <button className="flex items-start gap-3 text-left" onClick={() => setClosing(true)}>
          <Quote className="mt-1 size-7 shrink-0 text-[#087CB8]" />
          <span className="text-[24px] leading-snug font-semibold text-[#18324A]">O desafio não é apenas iniciar novos projetos, mas garantir coerência entre o tempo da formação e o tempo de execução dos recursos.</span>
        </button>
      </Movable>

      <AnimatePresence>
        {closing && (
          <motion.button
            className="absolute inset-0 z-30 flex flex-col items-start justify-center bg-white px-[160px] text-left"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }}
            onClick={() => setClosing(false)}
          >
            <span className="mb-8 h-1.5 w-40 rounded-full bg-[#EE7F12]" />
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
