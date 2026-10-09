import { dayOf, fmtDate, fromDay, intersect, partAfter, toDay } from "@/lib/dates"
import type { EffItem } from "@/lib/analysis"
import { docVigRange, offeringLabel, shortNameOf } from "@/lib/v6"
import { cn } from "@/lib/utils"
import { useStudio } from "@/store/store"
import { useEffectiveItems, useProjectColor } from "@/store/hooks"
import { useView, type JourneyMode } from "@/store/view"
import { JourneyMatrix } from "./JourneyMatrix"

/**
 * Formative journey, three readings of the same records:
 *  A — conceptual: the expected sequence, independent of any turma;
 *  B — real, by turma: only what is linked to the selected turma;
 *  C — matrix of generations (years × cohorts).
 * Nothing is assumed: a stage without a linked record reads "não informado".
 */
const STAGES: { key: string; when: string; grade: string; name: string; keys: readonly string[]; optional?: boolean }[] = [
  { key: "pre", when: "Pré-entrada", grade: "", name: "Despertar", keys: ["despertar"], optional: true },
  { key: "a1", when: "Ano 1", grade: "9º ano", name: "Jornada Tecnológica", keys: ["jornada"] },
  { key: "a2", when: "Ano 2", grade: "1º ano · Ensino Médio", name: "Robótica", keys: ["robótica", "robotica"] },
  { key: "a3", when: "Ano 3", grade: "2º ano · Ensino Médio", name: "Técnico — 1º ano", keys: ["técnico", "tecnico"] },
  { key: "a4", when: "Ano 4", grade: "3º ano · Ensino Médio", name: "Técnico — 2º ano", keys: ["técnico", "tecnico"] },
  { key: "ext", when: "Extensão", grade: "opcional", name: "Graduação", keys: ["gradua"], optional: true },
]

const COMPLEMENTARY = [
  { name: "Visita à SKA", keys: ["visita"] },
  { name: "Bolsa de Inglês", keys: ["inglês", "ingles"] },
  { name: "Monitoria", keys: ["monitoria"] },
  { name: "Estágio de desenvolvimento", keys: ["estágio", "estagio"] },
]

const has = (it: EffItem, keys: readonly string[]) => keys.some((k) => it.name.toLowerCase().includes(k))

export function JourneyView({ size = "studio" }: { size?: "studio" | "stage" }) {
  const mode = useView((s) => s.journeyMode)
  const set = useView((s) => s.set)
  const big = size === "stage"
  const tabs: [JourneyMode, string][] = [
    ["conceitual", "Jornada conceitual"],
    ["turma", "Jornada real por turma"],
    ["matriz", "Matriz de gerações"],
  ]
  return (
    <div className="flex h-full flex-col bg-white">
      <div className={cn("flex flex-wrap items-center gap-3", big ? "mb-5" : "border-b px-5 py-3")}>
        {!big && (
          <div>
            <h2 className="font-display text-[17px] font-bold text-navy">Jornada formativa</h2>
            <p className="text-[11.5px] text-muted-foreground">Percurso de quatro anos e atividades complementares, a partir dos registros cadastrados.</p>
          </div>
        )}
        <div role="tablist" aria-label="Forma da jornada" className={cn("flex rounded-md border bg-muted p-0.5", !big && "ml-auto")}>
          {tabs.map(([id, label]) => (
            <button key={id} role="tab" aria-selected={mode === id} onClick={() => set({ journeyMode: id })}
              className={cn("rounded px-3 py-1 font-semibold whitespace-nowrap", big ? "text-[17px]" : "text-xs", mode === id ? "bg-white text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
              {label}
            </button>
          ))}
        </div>
        {mode === "turma" && <TurmaPicker big={big} />}
      </div>
      <div className={cn("min-h-0 flex-1", !big && "overflow-auto px-5 py-4")}>
        {mode === "conceitual" ? <Conceptual big={big} /> : mode === "turma" ? <ByTurma big={big} /> : <JourneyMatrix size={size} />}
      </div>
    </div>
  )
}

function TurmaPicker({ big }: { big: boolean }) {
  const turmas = useStudio((s) => s.doc.turmas ?? [])
  const cur = useView((s) => s.journeyTurma)
  const set = useView((s) => s.set)
  const value = cur ?? turmas[0]?.id ?? ""
  return (
    <label className={cn("flex items-center gap-2 text-muted-foreground", big ? "text-[17px]" : "text-xs")}>
      Turma
      <select aria-label="Turma da jornada" className={cn("field !w-auto font-semibold text-foreground", big && "!text-[17px]")} value={value} onChange={(e) => set({ journeyTurma: e.target.value })}>
        {turmas.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
    </label>
  )
}

function ProjectChip({ projectId, hyp, big }: { projectId: string | null; hyp?: boolean; big: boolean }) {
  const projects = useStudio((s) => s.doc.projects)
  const colorOf = useProjectColor()
  const p = projects.find((x) => x.id === projectId)
  if (!p) return <span className={cn("text-muted-foreground", big ? "text-[14px]" : "text-[10.5px]")}>projeto não vinculado</span>
  const c = colorOf(p.id)
  return (
    <span className={cn("inline-flex items-center rounded px-1.5 font-bold", big ? "text-[14px]" : "text-[10.5px]")}
      style={hyp || p.id === "p3" ? { border: `1.5px dashed ${c}`, color: c } : { background: c, color: "#fff" }}>
      {p.short}{hyp || p.id === "p3" ? " · hipótese" : ""}
    </span>
  )
}

function Conceptual({ big }: { big: boolean }) {
  const items = useEffectiveItems().filter((i) => !i.hidden)
  const pool = items.filter((i) => ["curso", "turma", "atividade", "bolsa"].includes(i.kind))
  const stages = STAGES.map((s) => ({ ...s, records: pool.filter((i) => i.kind !== "bolsa" && has(i, s.keys)) }))
  const comp = COMPLEMENTARY.map((c) => ({ ...c, records: pool.filter((i) => has(i, c.keys) || (c.keys.includes("ingles") && i.consolidation === "ingles")) }))
  const t = big ? { h: "text-[22px]", s: "text-[15px]", b: "text-[16px]" } : { h: "text-[14px]", s: "text-[11px]", b: "text-[12px]" }
  return (
    <div>
      <div className="grid grid-cols-6 gap-2">
        {stages.map((s, i) => {
          const empty = s.records.length === 0
          return (
            <div key={s.key} className={cn("relative flex flex-col rounded-lg border p-3", empty ? "border-dashed bg-white" : "bg-[#F7F9FC]", s.optional && "opacity-90")}>
              <div className={cn("font-mono font-semibold text-primary", t.s)}>{s.when}</div>
              <div className={cn("text-muted-foreground", t.s)}>{s.grade || " "}</div>
              <div className={cn("mt-1 font-bold text-foreground", t.h)}>{s.name}</div>
              <div className={cn("mt-2 space-y-1.5", t.b)}>
                {empty ? (
                  <span className="text-muted-foreground">{s.optional ? "não cadastrado" : "nenhum registro vinculado"}</span>
                ) : (
                  s.records.slice(0, 3).map((r) => (
                    <button key={r.id} onClick={() => !big && useStudio.getState().select([r.id])} className="block w-full text-left">
                      <span className="block truncate font-medium">{shortNameOf(r)}</span>
                      <span className="flex flex-wrap items-center gap-1">
                        <ProjectChip projectId={r.projectId} hyp={r.certainty === "hipotese"} big={big} />
                        <span className={cn("text-muted-foreground", t.s)}>{r.dateUndetermined ? "data a validar" : `${fmtDate(r.start, "month")}–${fmtDate(r.end, "month")}`}</span>
                      </span>
                    </button>
                  ))
                )}
              </div>
              {i < stages.length - 1 && <span aria-hidden="true" className={cn("absolute top-1/2 -right-2 z-10 -translate-y-1/2 text-primary", big ? "text-[22px]" : "text-sm")}>›</span>}
            </div>
          )
        })}
      </div>
      <div className={cn("mt-5 font-bold tracking-wider text-muted-foreground uppercase", big ? "text-[15px]" : "text-[11px]")}>Atividades complementares</div>
      <div className="mt-2 grid grid-cols-4 gap-2">
        {comp.map((c) => (
          <div key={c.name} className={cn("rounded-lg border p-3", c.records.length ? "bg-[#F7F9FC]" : "border-dashed")}>
            <div className={cn("font-semibold text-foreground", big ? "text-[18px]" : "text-[13px]")}>{c.name}</div>
            <div className={cn("text-muted-foreground", t.s)}>
              {c.records.length ? `${c.records.length} período(s) cadastrado(s) · ${fmtDate(c.records[0].start, "month")}–${fmtDate(c.records[c.records.length - 1].end, "month")}` : "não cadastrado"}
            </div>
          </div>
        ))}
      </div>
      <p className={cn("mt-4 text-muted-foreground", t.s)}>Sequência esperada de formação, independente de turma. Não presume que todos os estudantes realizem todas as etapas.</p>
    </div>
  )
}

function ByTurma({ big }: { big: boolean }) {
  const doc = useStudio((s) => s.doc)
  const items = useEffectiveItems()
  const sel = useView((s) => s.journeyTurma)
  const turma = (doc.turmas ?? []).find((t) => t.id === sel) ?? (doc.turmas ?? [])[0]
  const ref = toDay(doc.settings.referenceDate)
  const vig = docVigRange(doc)
  const t = big ? { h: "text-[22px]", s: "text-[15px]", b: "text-[16px]" } : { h: "text-[14px]", s: "text-[11px]", b: "text-[12px]" }
  if (!turma) return <p className="text-muted-foreground">Nenhuma turma cadastrada. Cadastre pelo painel de um curso.</p>
  const offering = items.find((i) => i.id === turma.offeringId)
  const y = turma.entryYear
  const linkedBolsas = items.filter((i) => i.kind === "bolsa" && (i.turmaIds ?? []).includes(turma.id))
  const genDocumented = !!turma.generationId
  const situation = (r: { start: number; end: number }, hyp: boolean) => (hyp ? "planejado" : r.end <= ref ? "realizado" : r.start <= ref ? "em andamento" : "planejado")
  const stages = [
    { label: "9º ano", name: "Jornada Tecnológica", year: y - 2 },
    { label: "1º ano EM", name: "Robótica", year: y - 1 },
    { label: "2º ano EM", name: "Técnico — 1º ano", year: y },
    { label: "3º ano EM", name: "Técnico — 2º ano", year: y + 1 },
  ]
  return (
    <div>
      <div className={cn("mb-3 text-foreground", t.b)}>
        <b>{turma.name}</b> · entrada {turma.entryYear} · {offering ? offeringLabel(doc, offering, true) : "oferta não vinculada"}
        {turma.status === "hipotese" && <span className="ml-2 font-semibold text-navy">turma de cenário — não formada</span>}
      </div>
      <div className="grid grid-cols-4 gap-2">
        {stages.map((s, i) => {
          const yr = { start: dayOf(s.year, 1), end: dayOf(s.year + 1, 1) }
          const isTech = i >= 2
          const seg = isTech && offering ? intersect(offering.range, yr) : null
          const state = seg ? situation(seg, offering!.certainty === "hipotese") : null
          const after = seg && vig ? partAfter(seg, vig) : null
          return (
            <div key={s.label} className={cn("rounded-lg border p-3", seg ? (state === "planejado" ? "border-dashed border-primary/60 bg-white" : "bg-[#F2F8FC]") : "border-dashed")}>
              <div className={cn("font-mono font-semibold text-primary", t.s)}>{s.label} · {s.year}</div>
              <div className={cn("mt-1 font-bold", t.h)}>{s.name}</div>
              {seg ? (
                <div className={cn("mt-2 space-y-1", t.b)}>
                  <div className="font-medium">{offering!.name}</div>
                  <div className="flex flex-wrap items-center gap-1.5"><ProjectChip projectId={offering!.projectId} hyp={offering!.certainty === "hipotese"} big={big} /><span className="text-muted-foreground">{state}</span></div>
                  {after && <div className="font-semibold text-[#9A4A08]">{fmtDate(fromDay(after.start), "month")} em diante: após a vigência de referência</div>}
                </div>
              ) : (
                <div className={cn("mt-2 text-muted-foreground", t.b)}>
                  {isTech ? "não informado" : genDocumented ? "não informado" : "não informado — participação nesta etapa não documentada para a turma"}
                </div>
              )}
            </div>
          )
        })}
      </div>
      <div className={cn("mt-4 font-bold tracking-wider text-muted-foreground uppercase", big ? "text-[15px]" : "text-[11px]")}>Vinculado à turma</div>
      <div className="mt-2 flex flex-wrap gap-2">
        {linkedBolsas.length === 0 && <span className={cn("text-muted-foreground", t.b)}>Nenhuma bolsa vinculada a esta turma.</span>}
        {linkedBolsas.map((b) => (
          <span key={b.id} className={cn("rounded-lg border bg-[#F7F9FC] px-3 py-2", t.b)}>
            <b>{shortNameOf(b)}</b> · {fmtDate(b.start, "month")}–{fmtDate(b.end, "month")} · {situation(b.range, b.certainty === "hipotese")}
          </span>
        ))}
      </div>
      <p className={cn("mt-4 text-muted-foreground", t.s)}>Só aparecem etapas e atividades efetivamente associadas à turma. Etapas anteriores dependem de vínculo documentado (geração educacional).</p>
    </div>
  )
}
