import { useEffect, useState } from "react"
import { motion, useReducedMotion } from "motion/react"
import { ChevronLeft, ChevronRight, GraduationCap } from "lucide-react"
import { dayOf, fmtMonthsSpan, intersect, partAfter } from "@/lib/dates"
import { vigenciaOf, type EffItem } from "@/lib/analysis"
import { useStudio } from "@/store/store"
import { useAnalysis } from "@/store/hooks"
import { Movable, SceneNotes, SceneTitle } from "./Stage"
import { stageScale } from "./common"

const STAGES = [
  { grade: "9º ano", name: "Jornada Tecnológica", keys: ["jornada"] },
  { grade: "1º ano · Ensino Médio", name: "Robótica", keys: ["robótica", "robotica"] },
  { grade: "2º ano · Ensino Médio", name: "Técnico — 1º ano", keys: ["técnico", "tecnico"] },
  { grade: "3º ano · Ensino Médio", name: "Técnico — 2º ano", keys: ["técnico", "tecnico"] },
]
const BX = [120, 560, 1000, 1440]
const BW = 380
const BY = 300

export function Scene2() {
  const doc = useStudio((s) => s.doc)
  const { items } = useAnalysis()
  const reduce = useReducedMotion()
  const Y0 = doc.settings.cohortStartYear
  const [step, setStep] = useState(reduce ? 3 : 0)
  useEffect(() => {
    if (reduce) return
    const t = window.setInterval(() => setStep((s) => (s + 1) % 4), 2600)
    return () => window.clearInterval(t)
  }, [reduce])

  const projects = items.filter((i) => i.kind === "projeto")
  const vig = vigenciaOf(items, "p2")
  const setCohort = (y: number) => useStudio.getState().commit("turma de referência", (d) => ({ ...d, settings: { ...d.settings, cohortStartYear: y } }))

  const stageInfo = STAGES.map((s, i) => {
    const year = Y0 + i
    const yr = { start: dayOf(year, 1), end: dayOf(year + 1, 1) }
    const covering = projects.filter((p) => intersect(p.range, yr))
    const actions = items.filter(
      (it) => (it.kind === "curso" || it.kind === "atividade" || it.kind === "turma") && intersect(it.range, yr) && s.keys.some((k) => it.name.toLowerCase().includes(k)),
    )
    const after = actions
      .map((a) => {
        const v = vigenciaOf(items, a.projectId)
        const seg = v ? partAfter(intersect(a.range, yr)!, v.range) : null
        return seg ? { a, seg } : null
      })
      .filter((x): x is { a: EffItem; seg: { start: number; end: number } } => !!x)
    return { ...s, year, covering, actions, after }
  })

  const { X } = stageScale(dayOf(2023, 1), dayOf(2030, 1), 120, 1680)

  return (
    <div className="absolute inset-0">
      <SceneTitle scene={1} eyebrow="A jornada do aluno" size={58} title="A formação ultrapassa os limites de um único projeto" sub="Percurso formativo de referência. Um estudante pode iniciar em um projeto, continuar no seguinte e concluir o Técnico em uma vigência posterior." />

      <Movable k="s1:cohort" x={1320} y={226} w={480}>
        <div className="flex items-center justify-end gap-3 text-[19px] text-[#AFC0E6]">
          Turma de referência — 9º ano em
          <button aria-label="Ano anterior" className="rounded-full border border-white/20 p-1 hover:bg-white/10" onClick={() => setCohort(Y0 - 1)}><ChevronLeft className="size-5" /></button>
          <span className="font-mono text-[26px] font-bold text-white">{Y0}</span>
          <button aria-label="Próximo ano" className="rounded-full border border-white/20 p-1 hover:bg-white/10" onClick={() => setCohort(Y0 + 1)}><ChevronRight className="size-5" /></button>
        </div>
      </Movable>

      {/* Path */}
      <svg className="pointer-events-none absolute inset-0" width={1920} height={1080} aria-hidden="true">
        <path d={`M${BX[0] + 40},${BY + 52} L${BX[3] + BW - 40},${BY + 52}`} stroke="#1E3470" strokeWidth={6} strokeLinecap="round" />
        <motion.path
          d={`M${BX[0] + 40},${BY + 52} L${BX[3] + BW - 40},${BY + 52}`}
          stroke="#2EA8FF"
          strokeWidth={6}
          strokeLinecap="round"
          initial={false}
          animate={{ pathLength: (step + 1) / 4 }}
          transition={{ duration: reduce ? 0 : 1.2, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      <motion.div
        className="absolute z-10 grid size-[76px] place-items-center rounded-full border-4 border-white bg-[#FF7A1A] shadow-[0_0_40px_#FF7A1A88]"
        initial={false}
        animate={{ left: BX[step] + BW / 2 - 38, top: BY + 14 }}
        transition={{ duration: reduce ? 0 : 1.2, ease: [0.22, 1, 0.36, 1] }}
      >
        <GraduationCap className="size-10 text-white" />
      </motion.div>

      {stageInfo.map((s, i) => (
        <motion.div
          key={i}
          className="absolute rounded-2xl border bg-[#081538]/90 p-6 pt-[96px]"
          style={{ left: BX[i], top: BY, width: BW, height: 380 }}
          animate={{ borderColor: i === step ? "#2EA8FF" : "rgba(255,255,255,0.10)", opacity: i <= step ? 1 : 0.55 }}
          transition={{ duration: 0.5 }}
        >
          <div className="font-mono text-[18px] font-semibold text-[#7FD1FF]">{s.grade}</div>
          <div className="mt-1 text-[30px] leading-tight font-bold text-white">{s.name}</div>
          <div className="mt-1 font-mono text-[46px] leading-none font-bold text-white/90">{s.year}</div>
          <div className="mt-4 space-y-2 text-[17px] leading-snug">
            {s.actions.length > 0 ? (
              s.actions.slice(0, 2).map((a) => (
                <div key={a.id} className={a.certainty === "hipotese" ? "text-[#D9CEFF]" : "text-[#D5DFF7]"}>
                  {a.certainty === "hipotese" ? "◌ " : "● "}
                  {a.name}
                  <span className="text-[#8FA2CF]">{a.dateUndetermined ? " · datas a comprovar" : a.certainty === "hipotese" ? " · cenário" : ""}</span>
                </div>
              ))
            ) : (
              <div className="text-[#8FA2CF]">Sem ação registrada neste ano para esta etapa.</div>
            )}
            {s.after.filter(({ a }) => a.certainty !== "hipotese").slice(0, 1).map(({ a, seg }) => (
              <div key={a.id} className="rounded-lg border border-[#FF7A1A]/60 bg-[#FF7A1A]/10 px-3 py-1.5 text-[16px] font-semibold text-[#FFB27A]">
                {a.name}: {fmtMonthsSpan(seg)} após a vigência de referência
              </div>
            ))}
          </div>
        </motion.div>
      ))}

      {/* Projects under each stage — what can support it (by period; link to be confirmed by documents) */}
      <svg className="pointer-events-none absolute inset-0" width={1920} height={1080} aria-hidden="true">
        <text x={120} y={730} fontSize={18} fontWeight={700} letterSpacing={3} fill="#7FD1FF">PROJETOS AO LONGO DO PERCURSO</text>
        {Array.from({ length: 8 }, (_, i) => 2023 + i).map((y) => (
          <g key={y}>
            <line x1={X(dayOf(y, 1))} x2={X(dayOf(y, 1))} y1={750} y2={920} stroke="#1A2C5C" />
            <text x={X(dayOf(y, 1)) + 6} y={912} fontSize={17} fill="#8FA2CF">{y}</text>
          </g>
        ))}
        {stageInfo.map((s, i) => (
          <rect key={`c${i}`} x={X(dayOf(s.year, 1)) + 2} y={750} width={X(dayOf(s.year + 1, 1)) - X(dayOf(s.year, 1)) - 4} height={140} rx={8} fill={i === step ? "#2EA8FF" : "#ffffff"} fillOpacity={i === step ? 0.16 : 0.04} />
        ))}
        {projects.map((p, i) => {
          const proj = doc.projects.find((x) => x.id === p.projectId)
          const hyp = p.certainty === "hipotese"
          return (
            <g key={p.id}>
              <rect x={X(p.range.start)} y={764 + i * 40} width={X(p.range.end) - X(p.range.start)} height={28} rx={8} fill={proj?.color} fillOpacity={hyp ? 0.15 : 0.85} stroke={proj?.color} strokeWidth={2} strokeDasharray={hyp ? "8 6" : undefined} />
              <text x={X(p.range.start) + 12} y={784 + i * 40} fontSize={17} fontWeight={700} fill="#fff">{proj?.short} · {proj?.phase}{hyp ? " (proposta)" : ""}</text>
            </g>
          )
        })}
        {vig && (
          <g>
            <line x1={X(vig.range.end)} x2={X(vig.range.end)} y1={744} y2={896} stroke="#FF7A1A" strokeWidth={3} />
            <text x={X(vig.range.end) + 8} y={740} fontSize={15} fontWeight={700} fill="#FFB27A">fim vigência P2</text>
          </g>
        )}
      </svg>

      <Movable k="s1:disclaimer" x={120} y={936} w={1680}>
        <p className="text-[16px] leading-snug text-[#8FA2CF]">
          Não presume que todos os estudantes percorram todas as etapas: a continuidade depende de seleção, adesão e das condições aplicáveis. A coincidência de período não comprova vínculo de financiamento.
        </p>
      </Movable>
      <SceneNotes scene={1} />
    </div>
  )
}
