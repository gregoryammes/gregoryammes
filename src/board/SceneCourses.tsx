import { useMemo, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { ChevronRight, RotateCcw } from "lucide-react"
import { cn } from "@/lib/utils"
import { calendarMonthsTouched, dayOf, fmtDate, fmtMonthsSpan, fromDay, partAfter, toDay } from "@/lib/dates"
import { acqOf, actionInfo, finRange, finRecordsIn, paidOf, type Tag } from "@/lib/finance"
import { C } from "@/lib/visual"
import { docVigRange, offeringLabel, shortNameOf } from "@/lib/v6"
import { useStudio } from "@/store/store"
import { useEffectiveItems } from "@/store/hooks"
import type { EffItem } from "@/lib/analysis"
import type { FinRecord } from "@/data/types"
import { Movable, SceneNotes, SceneTitle } from "./Stage"
import { StageAxis, stageScale } from "./common"

/** Narrative steps: each one reveals a component of the selected course. Nothing is edited here. */
const STEPS = [
  { id: "aquisicao", label: "Aquisição" },
  { id: "bolsas", label: "Bolsas" },
  { id: "nf", label: "Notas fiscais" },
  { id: "materiais", label: "Materiais" },
  { id: "apos", label: "Compromissos após a vigência" },
] as const
type StepId = (typeof STEPS)[number]["id"]

const PLOT_X = 420
const PLOT_W = 830
const AXIS_Y = 300
const ROW0 = 400
const ROW_H = 74
const SUB_H = 44

const TAG: Record<Tag["tone"], string> = {
  paid: "border-[#9FD3BB] bg-[#E7F4EE] text-[#1C6B4B]",
  pending: "border-[#F6C99A] bg-[#FFF3E6] text-[#9A4A08]",
  plan: "border-[#CBD5E1] bg-[#F1F4F8] text-[#475569]",
  neutral: "border-[#CBD5E1] bg-[#F1F4F8] text-[#475569]",
  scenario: "border-[#B9BEF0] bg-[#EEF0FB] text-[#3730A3]",
  warn: "border-[#E3C25C] bg-[#FFF8DB] text-[#6B4E00]",
  info: "border-[#A9D2EA] bg-[#E8F3FA] text-[#0B5F8C]",
  proposal: "border-[#C9BCE3] bg-[#F4F0FB] text-[#5B4A86]",
}

/** Scene — courses as single actions; their acquisition, grants, NFs and materials revealed on demand. */
export function SceneCourses() {
  const doc = useStudio((s) => s.doc)
  const sid = useStudio((s) => s.scenarioId)
  const items = useEffectiveItems()
  const fins = useMemo(() => finRecordsIn(doc, sid), [doc, sid])
  const ref = toDay(doc.settings.referenceDate)
  const vig = docVigRange(doc)
  const [project, setProject] = useState("p2")
  const courses = items.filter((i) => !i.hidden && i.kind === "curso" && i.projectId === project && !i.parentId).sort((a, b) => a.range.start - b.range.start)
  const [selId, setSelId] = useState<string | null>(null)
  const [shown, setShown] = useState(0)
  const sel = courses.find((c) => c.id === selId) ?? null
  const revealed = new Set(STEPS.slice(0, shown).map((s) => s.id))

  const d0 = dayOf(2025, 1)
  const d1 = dayOf(2029, 1)
  const { X } = stageScale(d0, d1, PLOT_X, PLOT_W)
  const clampX = (d: number) => Math.max(PLOT_X, Math.min(PLOT_X + PLOT_W, X(d)))

  const choose = (id: string) => {
    setSelId(id === selId ? null : id)
    setShown(0)
  }

  // Row geometry: the selected course opens its revealed sub-rows below it.
  let y = ROW0
  const geo = courses.map((c) => {
    const top = y
    const subs = c.id === selId ? STEPS.filter((s) => revealed.has(s.id)).length : 0
    y += ROW_H + subs * SUB_H
    return { c, top, subs }
  })

  return (
    <div className="absolute inset-0">
      <SceneTitle scene={4} n={2} eyebrow="Cursos e compromissos" title="Cada curso é uma ação, com seus compromissos" size={56} />

      {/* Project switch — visualization only */}
      <div className="absolute top-[236px] left-[120px] flex gap-2">
        {doc.projects.map((p) => (
          <button key={p.id} onClick={() => { setProject(p.id); setSelId(null); setShown(0) }}
            className={cn("rounded-full border-2 px-4 py-1 text-[17px] font-bold", project === p.id ? "text-white" : "bg-white")}
            style={project === p.id ? { background: p.color, borderColor: p.color } : { borderColor: p.color, color: p.color }}>
            {p.name}
          </button>
        ))}
      </div>

      <svg className="pointer-events-none absolute inset-0" width={1920} height={1080} aria-hidden="true">
        <StageAxis d0={d0} d1={d1} X={X} y={AXIS_Y} months={false} />
        {vig && (
          <>
            <rect x={X(vig.end)} y={AXIS_Y + 80} width={PLOT_X + PLOT_W - X(vig.end)} height={Math.max(0, y - AXIS_Y - 80)} fill={C.afterSoft} />
            <line x1={X(vig.end)} x2={X(vig.end)} y1={AXIS_Y + 80} y2={Math.max(y, AXIS_Y + 200)} stroke={C.vigLine} strokeWidth={3} />
            <text x={X(vig.end) + 8} y={AXIS_Y + 100} fontSize={16} fontWeight={700} fill={C.vigLine}>{fmtDate(fromDay(vig.end - 1))} · fim da vigência de referência</text>
          </>
        )}
        <line x1={X(ref)} x2={X(ref)} y1={AXIS_Y + 80} y2={Math.max(y, AXIS_Y + 200)} stroke="#5FA548" strokeWidth={2.5} />
      </svg>

      {courses.length === 0 && (
        <p className="absolute top-[420px] left-[120px] w-[1100px] text-[22px] text-[#64748B]">Nenhum curso cadastrado para este projeto. Propostas futuras permanecem como hipótese até validação.</p>
      )}

      {geo.map(({ c, top }) => {
        const info = actionInfo(c, items, fins, ref)
        const hyp = c.certainty === "hipotese"
        const color = doc.projects.find((p) => p.id === c.projectId)?.color ?? C.blue
        const after = vig ? partAfter(c.range, vig) : null
        const isSel = c.id === selId
        const label = offeringLabel(doc, c, false)
        const [name, ...turma] = label.split(" · ")
        return (
          <div key={c.id}>
            <button type="button" onClick={() => choose(c.id)} aria-pressed={isSel} aria-label={`Curso ${name}`}
              className={cn("absolute flex flex-col items-start justify-center rounded-l-[6px] border-l-[6px] pr-3 pl-4 text-left", isSel ? "bg-[#E6F2FA]" : "hover:bg-[#F6F8FB]")}
              style={{ left: 120, top, width: 290, height: ROW_H - 10, borderColor: color }}>
              <span className="text-[24px] leading-tight font-bold text-[#18324A]">{name}</span>
              <span className="text-[16px] text-[#64748B]">{turma.join(" · ")}</span>
            </button>
            <svg className="pointer-events-none absolute" style={{ left: 0, top }} width={1920} height={ROW_H} aria-hidden="true">
              <rect x={clampX(c.range.start)} y={6} width={Math.max(4, clampX(c.range.end) - clampX(c.range.start))} height={36} rx={5}
                fill={hyp ? "#FFFFFF" : color} stroke={hyp ? C.scenario : color} strokeWidth={hyp ? 2.5 : 0} strokeDasharray={hyp ? "8 5" : undefined} />
              {after && <rect x={clampX(after.start)} y={6} width={Math.max(2, clampX(after.end) - clampX(after.start))} height={36} rx={5} fill="url(#sc-after)" />}
              {after && <rect x={clampX(after.start)} y={38} width={Math.max(2, clampX(after.end) - clampX(after.start))} height={4} fill={C.after} />}
              <defs>
                <pattern id="sc-after" patternUnits="userSpaceOnUse" width="12" height="12" patternTransform="rotate(45)">
                  <line x1="0" y1="0" x2="0" y2="12" stroke={C.after} strokeWidth="4" strokeOpacity="0.6" />
                </pattern>
              </defs>
              <text x={clampX(c.range.start) + 12} y={30} fontSize={17} fontWeight={700} fill={hyp ? C.text : "#FFFFFF"}>
                {fmtDate(c.start, "month")} – {fmtDate(c.end, "month")}{hyp ? " · previsto" : ""}
              </text>
            </svg>
            <div className="pointer-events-none absolute flex gap-1.5" style={{ left: Math.min(clampX(c.range.start), PLOT_X + PLOT_W - 420), top: top + 45 }}>
              {info.tags.slice(0, 3).map((t) => (
                <span key={t.label} className={cn("rounded-full border px-2 py-px text-[13px] leading-[18px] font-bold whitespace-nowrap", TAG[t.tone])}>{t.label}</span>
              ))}
            </div>
            {isSel && (
              <SubRows c={c} top={top + ROW_H} revealed={revealed} items={items} fins={fins} clampX={clampX} vig={vig} />
            )}
          </div>
        )
      })}

      {/* Synthesis + narrative controls */}
      <AnimatePresence>
        {sel && (
          <motion.div key={sel.id} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="absolute top-[300px] left-[1290px] w-[510px]">
            <Movable k="s4:synthesis" x={0} y={0} w={510}>
              <Synthesis c={sel} items={items} fins={fins} ref_={ref} vig={vig} shown={shown} />
              <div className="mt-3 flex flex-wrap gap-2">
                {STEPS.map((s, i) => (
                  <button key={s.id} onClick={() => setShown(i + 1 === shown ? i : i + 1)}
                    className={cn("rounded-full border-2 px-3 py-1 text-[15px] font-semibold", i < shown ? "border-[#087CB8] bg-[#087CB8] text-white" : "border-[#B6C2D0] text-[#18324A] hover:border-[#087CB8]")}>
                    {i + 1}. {s.label}
                  </button>
                ))}
              </div>
              <div className="mt-2 flex gap-2">
                <button disabled={shown >= STEPS.length} onClick={() => setShown(shown + 1)} className="flex items-center gap-1 rounded-md bg-[#173B63] px-4 py-2 text-[16px] font-bold text-white disabled:opacity-40">
                  Revelar próximo <ChevronRight className="size-4" />
                </button>
                <button onClick={() => setShown(0)} className="flex items-center gap-1 rounded-md border-2 border-[#B6C2D0] px-4 py-2 text-[16px] font-semibold text-[#18324A]">
                  <RotateCcw className="size-4" /> Recolher
                </button>
              </div>
              <p className="mt-2 text-[14px] leading-snug text-[#64748B]">Etapas da narrativa: revelam componentes registrados, sem alterar dados.</p>
            </Movable>
          </motion.div>
        )}
      </AnimatePresence>
      {!sel && courses.length > 0 && (
        <p className="absolute top-[400px] left-[1290px] w-[510px] text-[22px] leading-snug text-[#64748B]">Clique em um curso para ver a síntese e revelar seus componentes.</p>
      )}
      <SceneNotes scene={4} />
    </div>
  )
}

function Synthesis({ c, items, fins, ref_, vig, shown }: { c: EffItem; items: EffItem[]; fins: FinRecord[]; ref_: number; vig: { start: number; end: number } | null; shown: number }) {
  const doc = useStudio((s) => s.doc)
  const info = actionInfo(c, items, fins, ref_)
  const acq = acqOf(fins, c.id)
  const label = offeringLabel(doc, c, false)
  const [name, ...turma] = label.split(" · ")
  const after = vig ? partAfter(c.range, vig) : null
  const neg = acq?.steps?.find((s) => s.id === "negociacao")
  const lines: string[] = [turma.join(" · ") || "Turma a identificar"]
  lines.push(`Execução ${c.range.end > ref_ ? "prevista" : "registrada"} até ${fmtDate(c.end, "month")}${c.certainty === "hipotese" ? " (planejamento)" : ""}.`)
  if (!acq) lines.push("Pagamento a validar: nenhuma aquisição registrada.")
  else if (acq.acqStatus === "integralmente_pago") lines.push(`Aquisição indicada como paga, conforme registros${acq.proof === "pendente" ? " — comprovação pendente" : ""}.`)
  else if (acq.acqStatus === "em_negociacao" && neg?.done) {
    lines.push(`Negociação concluída${neg.date ? ` em ${fmtDate(neg.date)}` : ""}, conforme registro${acq.supplier ? ` (${acq.supplier})` : ""}.`)
    lines.push("Formalização da compra a confirmar.")
  } else lines.push(`Aquisição: ${acq.acqStatus === "contratado" ? "contratada" : acq.acqStatus === "parcialmente_pago" ? "parcialmente paga" : acq.acqStatus === "em_negociacao" ? "em negociação" : "prevista"}, conforme registros.`)
  if (info.bolsas.length) lines.push(info.bolsas.every((b) => b.certainty === "hipotese" || b.certainty === "planejado") ? "Bolsas futuras a planejar." : "Bolsas estudantis vinculadas.")
  if (after) lines.push(`Formação posterior à vigência de referência: ${calendarMonthsTouched(after)} meses (${fmtMonthsSpan(after)}).`)
  return (
    <div className="rounded-[10px] border-2 border-[#DFE6EE] bg-white p-5 shadow-[0_18px_40px_-28px_rgba(23,59,99,0.45)]">
      <div className="text-[15px] font-bold tracking-[0.14em] text-[#087CB8] uppercase">Síntese · {shown === 0 ? "curso recolhido" : `${shown} de ${STEPS.length} componentes revelados`}</div>
      <div className="mt-1 font-display text-[34px] leading-tight font-extrabold text-[#18324A]">{name}</div>
      <ul className="mt-2 space-y-1.5 text-[19px] leading-snug text-[#18324A]">
        {lines.map((l) => <li key={l} className="flex gap-2"><span className="mt-[10px] size-2 shrink-0 rounded-full bg-[#087CB8]" />{l}</li>)}
      </ul>
    </div>
  )
}

function SubRows({ c, top, revealed, items, fins, clampX, vig }: {
  c: EffItem; top: number; revealed: Set<StepId>; items: EffItem[]; fins: FinRecord[]; clampX: (d: number) => number; vig: { start: number; end: number } | null
}) {
  const mine = fins.filter((f) => f.actionId === c.id)
  const acq = acqOf(fins, c.id)
  const bolsas = items.filter((i) => i.parentId === c.id && i.kind === "bolsa")
  const rows: { id: StepId; label: string; body: React.ReactNode }[] = []
  const marker = (f: FinRecord, y: number) => {
    const r = finRange(f)
    if (!r) return null
    const x1 = clampX(r.start)
    const x2 = clampX(r.end)
    if (f.dateUndetermined)
      return (
        <g key={f.id}>
          <path d={`M${x1},${y - 9} v18 M${x1},${y} H${x2} M${x2},${y - 9} v18`} stroke={C.muted} strokeWidth={2.5} strokeDasharray="6 4" fill="none" />
          <text x={x2 + 10} y={y + 6} fontSize={17} fontWeight={600} fill={C.text2}>{f.name} · data a definir</text>
        </g>
      )
    const proven = f.realized && f.proof === "comprovado"
    return (
      <g key={f.id}>
        <circle cx={x1} cy={y} r={9} fill={proven ? C.paid : f.realized ? C.slate : "#FFFFFF"} stroke={proven ? C.paid : C.muted} strokeWidth={2.5} strokeDasharray={f.realized ? undefined : "3 3"} />
        <text x={x1 + 14} y={y + 6} fontSize={17} fontWeight={600} fill={C.text2}>{f.docNumber ?? f.name} · {fmtDate(f.start!)}</text>
      </g>
    )
  }
  const empty = (t: string) => <text x={clampX(c.range.start) + 4} y={28} fontSize={17} fontStyle="italic" fill={C.text3}>{t}</text>
  if (revealed.has("aquisicao")) {
    const { total } = acq ? paidOf(fins, acq) : { total: null }
    const pays = mine.filter((f) => f.kind === "pagamento")
    const dated = (acq?.steps ?? []).filter((s) => s.done && s.date)
    rows.push({
      id: "aquisicao",
      label: "Aquisição e pagamento",
      body: (
        <>
          {dated.map((s) => (
            <g key={s.id}>
              <path d={`M${clampX(toDay(s.date!))},16 l9,9 l-9,9 l-9,-9 z`} fill={C.navy} />
              <text x={clampX(toDay(s.date!)) + 14} y={31} fontSize={16} fontWeight={600} fill={C.navy}>{s.id === "negociacao" ? "negociação concluída" : s.id}</text>
            </g>
          ))}
          {pays.map((p) => marker(p, 25))}
          <text x={Math.max(clampX(c.range.start), ...pays.map((p) => clampX(finRange(p)?.end ?? 0) + 330), ...dated.map((s) => clampX(toDay(s.date!)) + 230))} y={31} fontSize={17} fontWeight={700} fill={acq?.acqStatus === "integralmente_pago" ? C.paid : "#9A4A08"}>
            {acq ? `${acq.acqStatus === "integralmente_pago" ? "Paga (registro)" : acq.acqStatus === "em_negociacao" ? "Compra a formalizar" : acq.acqStatus}${total != null ? ` · ${total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}` : " · valor não informado"}${acq.proof === "pendente" ? " · comprovação pendente" : ""}` : "Pagamento a validar"}
          </text>
        </>
      ),
    })
  }
  if (revealed.has("bolsas"))
    rows.push({
      id: "bolsas",
      label: "Bolsas dos alunos",
      body: bolsas.length ? (
        bolsas.map((b) => {
          const hyp = b.certainty === "hipotese" || b.certainty === "planejado"
          return (
            <g key={b.id}>
              <rect x={clampX(b.range.start)} y={13} width={clampX(b.range.end) - clampX(b.range.start)} height={22} rx={4} fill={hyp ? "#FFFFFF" : "#7FB8DC"} stroke={hyp ? C.scenario : "none"} strokeWidth={2} strokeDasharray={hyp ? "6 4" : undefined} />
              <text x={clampX(b.range.start) + 10} y={30} fontSize={15} fontWeight={700} fill={hyp ? C.text : "#FFFFFF"}>{shortNameOf(b)} · {hyp ? "futuras, a planejar" : "período registrado"}</text>
            </g>
          )
        })
      ) : empty("Nenhuma bolsa vinculada"),
    })
  if (revealed.has("nf")) {
    const nfs = mine.filter((f) => f.kind === "nf")
    rows.push({ id: "nf", label: "Notas fiscais", body: nfs.length ? nfs.map((f) => marker(f, 25)) : empty("Nenhuma nota fiscal cadastrada") })
  }
  if (revealed.has("materiais")) {
    const mats = mine.filter((f) => f.kind === "material" || f.kind === "servico")
    rows.push({ id: "materiais", label: "Materiais e recursos", body: mats.length ? mats.map((f) => marker(f, 25)) : empty("Nenhum material cadastrado") })
  }
  if (revealed.has("apos")) {
    const after = vig ? partAfter(c.range, vig) : null
    const open = [...bolsas.filter((b) => vig && b.range.end > vig.end).map((b) => shortNameOf(b)), ...mine.filter((f) => !f.realized && f.kind !== "aquisicao" && vig && (finRange(f)?.end ?? 0) > vig.end).map((f) => f.name)]
    rows.push({
      id: "apos",
      label: "Após a vigência",
      body: after ? (
        <>
          <rect x={clampX(after.start)} y={13} width={clampX(after.end) - clampX(after.start)} height={22} rx={4} fill={C.afterSoft} stroke={C.after} strokeWidth={2} />
          <text x={clampX(after.start) + 10} y={30} fontSize={15} fontWeight={700} fill={C.afterText}>{calendarMonthsTouched(after)} meses de formação{open.length ? ` + ${open.length} compromisso(s)` : ""}</text>
        </>
      ) : empty("Nenhum compromisso registrado após a vigência de referência"),
    })
  }
  return (
    <>
      {rows.map((r, i) => (
        <motion.div key={r.id} initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="absolute" style={{ left: 0, top: top + i * SUB_H - 8 }}>
          <div className="absolute flex h-[44px] w-[290px] items-center pl-10 text-[17px] font-semibold text-[#64748B]" style={{ left: 120 }}>└ {r.label}</div>
          <svg width={1920} height={SUB_H} className="pointer-events-none block" aria-label={r.label}>{r.body}</svg>
        </motion.div>
      ))}
    </>
  )
}
