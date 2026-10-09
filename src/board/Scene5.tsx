import { useMemo, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { ChevronRight, RotateCcw } from "lucide-react"
import { cn } from "@/lib/utils"
import { fmtDate } from "@/lib/dates"
import { applyScenario } from "@/lib/analysis"
import { seedStrategy } from "@/data/v11"
import { IDEA_STATUS_LABEL, PILLARS, type IdeaStatus } from "@/data/types"
import { useStudio } from "@/store/store"
import { Movable, SceneNotes, SceneTitle } from "./Stage"

const TONE: Record<IdeaStatus, string> = {
  ideia: "border-[#CBD5E1] text-[#475569]",
  em_analise: "border-[#A9D2EA] bg-[#E8F3FA] text-[#0B5F8C]",
  priorizada: "border-[#F6C99A] bg-[#FFF3E6] text-[#9A4A08]",
  validada: "border-[#9FD3BB] bg-[#E7F4EE] text-[#1C6B4B]",
  nao_priorizada: "border-[#E2E8F0] text-[#94A3B8]",
}

/** Scene 5 — the future, from the Projeto 3 board: four pillars revealed one by one. */
export function Scene5() {
  const doc = useStudio((s) => s.doc)
  const sid = useStudio((s) => s.scenarioId)
  const s = doc.strategy ?? seedStrategy()
  const p3 = useMemo(() => applyScenario(doc, sid).find((i) => i.kind === "projeto" && i.projectId === "p3"), [doc, sid])
  const pillars = PILLARS.filter((p) => p.id !== "transversal")
  const [shown, setShown] = useState(0)
  const p3color = doc.projects.find((p) => p.id === "p3")?.color ?? "#8870B5"

  return (
    <div className="absolute inset-0">
      <SceneTitle scene={5} n={5} eyebrow="Futuro do SKA Tech Hub" title="Formação, talentos, estrutura e inteligência artificial" size={56} />

      <Movable k="s5:band" x={120} y={230} w={1680}>
        <div className="flex items-center gap-4">
          <div className="flex h-[44px] flex-1 items-center rounded-[8px] border-[3px] border-dashed px-5 text-[20px] font-bold" style={{ borderColor: p3color, color: p3color, background: `${p3color}0F` }}>
            Projeto 3 · em modelagem{p3 ? ` · ${fmtDate(p3.start, "month")} – ${fmtDate(p3.end, "month")} (hipótese do cenário)` : ""} · premissa de {s.premiseYears} anos, sujeita à legislação
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShown(Math.min(pillars.length, shown + 1))} disabled={shown >= pillars.length}
              className="flex items-center gap-1 rounded-md bg-[#173B63] px-4 py-2.5 text-[17px] font-bold text-white disabled:opacity-40">
              Revelar pilar <ChevronRight className="size-5" />
            </button>
            <button onClick={() => setShown(shown >= pillars.length ? 0 : pillars.length)} className="flex items-center gap-1 rounded-md border-2 border-[#B6C2D0] px-4 py-2.5 text-[17px] font-semibold text-[#18324A]">
              {shown >= pillars.length ? <><RotateCcw className="size-4" /> Recomeçar</> : "Mostrar todos"}
            </button>
          </div>
        </div>
      </Movable>

      <div className="absolute top-[310px] left-[120px] grid w-[1680px] grid-cols-4 gap-6">
        {pillars.map((p, i) => {
          const ideas = s.ideas.filter((x) => x.pillar === p.id).sort((a, b) => a.order - b.order)
          const on = i < shown
          return (
            <motion.section key={p.id} aria-label={`Pilar ${p.label}`} animate={{ opacity: on ? 1 : 0.16, y: on ? 0 : 10 }} transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className="flex h-[560px] flex-col rounded-[14px] border-2 bg-white p-5" style={{ borderColor: `${p.color}66` }}>
              <div className="flex items-center gap-3">
                <span className="grid size-11 place-items-center rounded-xl text-[22px] font-extrabold text-white" style={{ background: p.color }}>{p.n}</span>
                <h3 className="text-[25px] leading-tight font-extrabold text-[#18324A]">{p.label}</h3>
              </div>
              <AnimatePresence>
                {on && (
                  <motion.ul initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }} className="mt-4 space-y-2.5">
                    {ideas.map((x) => (
                      <li key={x.id} className={cn("flex items-start gap-2.5 text-[19px] leading-snug text-[#18324A]", x.status === "nao_priorizada" && "text-[#94A3B8] line-through")}>
                        <span className="mt-[9px] size-2.5 shrink-0 rounded-full" style={{ background: p.color }} />
                        <span className="flex-1">{x.name}</span>
                        <span className={cn("shrink-0 rounded-full border px-2 py-px text-[12.5px] font-bold whitespace-nowrap", TONE[x.status])}>{IDEA_STATUS_LABEL[x.status]}</span>
                      </li>
                    ))}
                  </motion.ul>
                )}
              </AnimatePresence>
            </motion.section>
          )
        })}
      </div>

      <Movable k="s5:transversal" x={120} y={890} w={1680}>
        <div className="flex items-center gap-4 rounded-[12px] border-2 border-[#CBD5E1] px-5 py-3 text-[19px] text-[#18324A]">
          <span className="rounded-md bg-[#475569] px-2.5 py-1 text-[14px] font-bold tracking-wider text-white">TRANSVERSAL</span>
          {s.ideas.filter((x) => x.pillar === "transversal").map((x) => x.name).join(" · ")}
          <span className="ml-auto text-[15px] text-[#64748B]">Propostas em avaliação — nenhuma aprovação ou elegibilidade presumida.</span>
        </div>
      </Movable>
      <SceneNotes scene={5} />
    </div>
  )
}
