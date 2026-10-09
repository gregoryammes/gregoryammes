import { useMemo } from "react"
import { dayOf, fmtDate, fromDay, intersect, partAfter, ymd, type DayRange } from "@/lib/dates"
import type { EffItem } from "@/lib/analysis"
import { C } from "@/lib/visual"
import { cn } from "@/lib/utils"
import { useStudio } from "@/store/store"
import { useEffectiveItems, useProjectColor } from "@/store/hooks"

/**
 * Formative journey by cohort, derived only from the registered records — nothing is stored here.
 * A cohort is named by the year it attends the 9º ano; each following year is the next stage.
 */
export const STAGES = [
  { short: "Jornada", name: "Jornada Tecnológica", keys: ["jornada"] },
  { short: "Robótica", name: "Robótica", keys: ["robótica", "robotica"] },
  { short: "Técnico · 1º ano", name: "Técnico — 1º ano", keys: ["técnico", "tecnico"] },
  { short: "Técnico · 2º ano", name: "Técnico — 2º ano", keys: ["técnico", "tecnico"] },
  { short: "Graduação", name: "Graduação", keys: ["gradua"] },
]

export type CellState = "registrado" | "cenario" | "a_validar" | "sem"

export interface Cell {
  cohort: number
  year: number
  stage: number
  state: CellState
  item?: EffItem
  /** Fraction of the year (0–1) from which the cell falls after the documental vigência. */
  afterFrom: number | null
}

const matches = (it: EffItem, keys: string[]) => keys.some((k) => it.name.toLowerCase().includes(k))

export function buildJourney(items: EffItem[], from: number, to: number) {
  const vig = items.find((i) => i.kind === "vigencia" && i.projectId === "p2") ?? items.find((i) => i.kind === "vigencia")
  const docVig: DayRange | null = vig ? (vig.baseRange ?? vig.range) : null
  const hasGrad = items.some((i) => matches(i, STAGES[4].keys))
  const stages = hasGrad ? 5 : 4
  const candidates = items.filter((i) => !i.hidden && ["curso", "turma", "atividade"].includes(i.kind))
  const cohorts: number[] = []
  for (let y = from; y <= to; y++) cohorts.push(y)
  const years: number[] = []
  for (let y = from; y <= to + stages - 1; y++) years.push(y)

  const cells: Cell[] = []
  for (const c of cohorts) {
    for (let s = 0; s < stages; s++) {
      const year = c + s
      const yr = { start: dayOf(year, 1), end: dayOf(year + 1, 1) }
      const st = STAGES[s]
      let pool = candidates.filter((i) => matches(i, st.keys) && intersect(i.range, yr))
      // A technical course started in year S is the cohort whose 1º ano técnico is S.
      if (s === 2 || s === 3) pool = pool.filter((i) => i.dateUndetermined || ymd(i.range.start).y === c + 2)
      const dated = pool.filter((i) => !i.dateUndetermined)
      const item = dated.find((i) => i.certainty !== "hipotese") ?? dated[0] ?? pool[0]
      let state: CellState = "sem"
      if (item) state = item.dateUndetermined ? "a_validar" : item.certainty === "hipotese" ? "cenario" : "registrado"
      let afterFrom: number | null = null
      if (item && !item.dateUndetermined && docVig) {
        const seg = intersect(item.range, yr)
        const after = seg ? partAfter(seg, docVig) : null
        if (after) afterFrom = (after.start - yr.start) / (yr.end - yr.start)
      }
      cells.push({ cohort: c, year, stage: s, state, item, afterFrom })
    }
  }
  return { cohorts, years, cells, docVig, stages }
}

export function JourneyMatrix({ size = "studio" }: { size?: "studio" | "stage" }) {
  const items = useEffectiveItems()
  const doc = useStudio((s) => s.doc)
  const selection = useStudio((s) => s.selection)
  const colorOf = useProjectColor()
  const range = doc.settings.journeyCohorts ?? { from: 2022, to: 2026 }
  const j = useMemo(() => buildJourney(items, range.from, range.to), [items, range.from, range.to])
  const projects = items.filter((i) => i.kind === "projeto" && !i.hidden)
  const big = size === "stage"
  const y0 = dayOf(j.years[0], 1)
  const y1 = dayOf(j.years[j.years.length - 1] + 1, 1)
  const pct = (d: number) => `${Math.max(0, Math.min(100, ((d - y0) / (y1 - y0)) * 100))}%`
  const setRange = (from: number, to: number) =>
    useStudio.getState().commit("turmas exibidas", (d) => ({ ...d, settings: { ...d.settings, journeyCohorts: { from, to } } }))
  const labelW = big ? 300 : 210

  return (
    <div className={cn("flex h-full flex-col bg-white", big ? "text-[20px]" : "text-[12.5px]")}>
      {!big && (
        <div className="flex flex-wrap items-center gap-3 border-b px-5 py-3">
          <div>
            <h2 className="font-display text-[17px] font-bold text-navy">Jornada formativa por turmas</h2>
            <p className="text-[11.5px] text-muted-foreground">Colunas: anos · linhas: turmas, pelo ano em que cursam o 9º ano. Calculada a partir dos registros cadastrados.</p>
          </div>
          <label className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
            Turmas de
            <input aria-label="Primeira turma" type="number" className="field !w-20" value={range.from} onChange={(e) => +e.target.value <= range.to && setRange(+e.target.value, range.to)} />
            a
            <input aria-label="Última turma" type="number" className="field !w-20" value={range.to} onChange={(e) => +e.target.value >= range.from && setRange(range.from, +e.target.value)} />
          </label>
        </div>
      )}
      <div className={cn("scroll-thin min-h-0 flex-1 overflow-auto", big ? "" : "px-5 py-4")}>
        <div className="relative min-w-[760px]">
          {/* Header: project bands + years */}
          <div className="flex">
            <div style={{ width: labelW }} className="shrink-0" />
            <div className="relative flex-1">
              <div className="relative" style={{ height: big ? 40 : 28 }}>
                {projects.map((p, i) => {
                  const hyp = p.certainty === "hipotese"
                  const color = colorOf(p.projectId)
                  const proj = doc.projects.find((x) => x.id === p.projectId)
                  const left = pct(p.range.start)
                  const right = pct(p.range.end)
                  return (
                    <div
                      key={p.id}
                      title={`${p.name} · ${fmtDate(p.start, p.precision)} – ${fmtDate(p.end, p.precision)}`}
                      className={cn("absolute flex items-center truncate rounded-[3px] px-2 font-semibold", big ? "text-[16px]" : "text-[11px]")}
                      style={{
                        left,
                        width: `calc(${right} - ${left})`,
                        top: (i % 2) * (big ? 20 : 14),
                        height: big ? 18 : 13,
                        background: hyp ? "#fff" : color,
                        color: hyp ? color : "#fff",
                        border: hyp ? `1.5px dashed ${color}` : undefined,
                      }}
                    >
                      {proj?.name}{hyp ? " · proposta" : ""}
                    </div>
                  )
                })}
              </div>
              <div className="mt-1 grid" style={{ gridTemplateColumns: `repeat(${j.years.length}, minmax(0, 1fr))` }}>
                {j.years.map((y) => (
                  <div key={y} className={cn("mx-px bg-[#E6EBF1] text-center font-bold text-foreground", big ? "py-1.5 text-[20px]" : "py-1 text-[13px]")}>{y}</div>
                ))}
              </div>
            </div>
          </div>

          {/* Matrix */}
          <div className="relative mt-1">
            {j.cohorts.map((c) => {
              const tech = j.cells.find((x) => x.cohort === c && x.stage === 2)
              return (
                <div key={c} className="flex border-b border-border/70">
                  <div style={{ width: labelW }} className={cn("shrink-0 pr-3 text-right", big ? "py-3" : "py-2")}>
                    <div className={cn("font-semibold text-foreground", big && "text-[21px]")}>Turma {c}</div>
                    <div className={cn("text-muted-foreground", big ? "text-[15px]" : "text-[11px]")}>
                      9º ano em {c}{tech?.item && !tech.item.dateUndetermined ? ` · ${tech.item.name}` : ""}
                    </div>
                  </div>
                  <div className="grid flex-1" style={{ gridTemplateColumns: `repeat(${j.years.length}, minmax(0, 1fr))` }}>
                    {j.years.map((y) => {
                      const cell = j.cells.find((x) => x.cohort === c && x.year === y)
                      if (!cell) return <div key={y} />
                      return <CellBox key={y} cell={cell} big={big} color={cell.item ? colorOf(cell.item.projectId) : C.plan} selected={!!cell.item && selection.includes(cell.item.id)} />
                    })}
                  </div>
                </div>
              )
            })}
            {/* Vigência end runs through the whole matrix */}
            {j.docVig && j.docVig.end > y0 && j.docVig.end < y1 && (
              <div className="pointer-events-none absolute inset-y-0" style={{ left: `calc(${labelW}px + (100% - ${labelW}px) * ${(j.docVig.end - y0) / (y1 - y0)})` }}>
                <div className="h-full w-[2.5px] bg-[#C2410C]/80" />
                <div className={cn("absolute top-full mt-1 font-bold whitespace-nowrap text-[#C2410C]", big ? "text-[17px]" : "text-[11.5px]")}>↑ {fmtDate(fromDay(j.docVig.end - 1))} · fim da vigência de referência</div>
              </div>
            )}
          </div>
          <div className={cn("flex flex-wrap items-center gap-x-5 gap-y-1 text-muted-foreground", big ? "mt-12 text-[16px]" : "mt-9 text-[11.5px]")}>
            <span className="flex items-center gap-1.5"><span className="h-3 w-6 rounded-sm bg-primary" /> etapa registrada</span>
            <span className="flex items-center gap-1.5"><span className="h-3 w-6 rounded-sm border-[1.5px] border-dashed border-navy bg-white" /> cenário / planejamento</span>
            <span className="flex items-center gap-1.5"><span className="h-3 w-6 rounded-sm border border-dotted border-[#8796A8] bg-[#F3F6FA]" /> período geral, data a validar</span>
            <span className="flex items-center gap-1.5"><span className="h-3 w-6 rounded-sm border border-dashed border-[#C9D3DE] bg-white" /> sem definição</span>
            <span className="flex items-center gap-1.5"><span className="h-3 w-6 rounded-sm bg-[#EE7F12]" /> trecho após a vigência</span>
            {!big && <span>Não presume que todos os estudantes percorram todas as etapas.</span>}
          </div>
        </div>
      </div>
    </div>
  )
}

function CellBox({ cell, big, color, selected }: { cell: Cell; big: boolean; color: string; selected: boolean }) {
  const stage = STAGES[cell.stage]
  const solid = cell.state === "registrado"
  const pad = big ? "px-3 py-3" : "px-2 py-1.5"
  const title = cell.item
    ? `${stage.name} · ${cell.year}\n${cell.item.name} (${cell.state === "a_validar" ? "período geral, data a validar" : cell.state === "cenario" ? "cenário" : "registrado"})`
    : `${stage.name} · ${cell.year}\nSem registro cadastrado para esta etapa`
  return (
    <button
      type="button"
      title={title}
      disabled={!cell.item}
      onClick={() => cell.item && useStudio.getState().select([cell.item.id])}
      className={cn(
        "relative m-[3px] overflow-hidden rounded-[4px] text-left leading-tight disabled:cursor-default",
        pad,
        solid && "text-white",
        cell.state === "cenario" && "border-[1.5px] border-dashed bg-white",
        cell.state === "a_validar" && "border border-dotted border-[#8796A8] bg-[#F3F6FA] text-foreground",
        cell.state === "sem" && "border border-dashed border-[#C9D3DE] bg-white text-muted-foreground",
        selected && "ring-2 ring-primary ring-offset-1",
      )}
      style={{ background: solid ? color : undefined, borderColor: cell.state === "cenario" ? color : undefined, color: cell.state === "cenario" ? color : undefined }}
    >
      {cell.afterFrom != null && (
        <span className="absolute inset-y-0 right-0 bg-[#EE7F12]" style={{ left: `${cell.afterFrom * 100}%`, opacity: solid ? 1 : 0.18 }} />
      )}
      <span className={cn("relative block truncate font-semibold", big ? "text-[18px]" : "text-[11.5px]")}>{stage.short}</span>
      <span className={cn("relative block truncate", big ? "text-[15px]" : "text-[10.5px]", solid ? "text-white/85" : "")}>
        {cell.item ? (cell.state === "a_validar" ? "a validar" : cell.item.name) : "sem definição"}
      </span>
    </button>
  )
}
