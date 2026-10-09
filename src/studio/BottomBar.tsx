import { useMemo, useRef } from "react"
import { Activity, ChevronDown, ChevronUp } from "lucide-react"
import { AgentTrace, type TraceSpan } from "@/components/ui/agent-trace"
import { dayOf, fmtDate, fromDay, fmtMonthsSpan, ymd } from "@/lib/dates"
import { LABEL_W } from "@/lib/layout"
import { cn } from "@/lib/utils"
import { useStudio } from "@/store/store"
import { useAnalysis, useProjectColor } from "@/store/hooks"
import { useView } from "@/store/view"

const MM_START = dayOf(2022, 7)
const MM_END = dayOf(2031, 7)

/** Mini-map of the whole horizon. Drag the window (or click) to navigate. */
export function MiniMap() {
  const { items } = useAnalysis()
  const view = useView()
  const colorOf = useProjectColor()
  const ref = useRef<HTMLDivElement>(null)
  const span = MM_END - MM_START
  const pct = (d: number) => ((d - MM_START) / span) * 100
  const winStart = view.x0
  const winEnd = view.x0 + view.width / view.pxPerDay
  const layers = ["projetos", "planejamento", "vigencias", "formacao", "bolsas", "operacao", "cenarios"]

  const seek = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect()
    const d = MM_START + ((clientX - r.left) / r.width) * span
    view.set({ x0: d - (winEnd - winStart) / 2 })
  }
  return (
    <div
      ref={ref}
      className="relative h-full flex-1 cursor-pointer overflow-hidden rounded-md border bg-[#050b1c]"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        seek(e.clientX)
      }}
      onPointerMove={(e) => e.currentTarget.hasPointerCapture(e.pointerId) && seek(e.clientX)}
      title="Mini mapa — clique ou arraste para navegar"
    >
      {Array.from({ length: 9 }, (_, i) => 2023 + i).map((y) => (
        <div key={y} className="absolute inset-y-0 border-l border-white/8 pl-1 text-[9px] text-muted-foreground" style={{ left: `${pct(dayOf(y, 1))}%` }}>{y}</div>
      ))}
      {items.filter((i) => !i.hidden).map((it) => (
        <div
          key={it.id}
          className="absolute h-[3px] rounded-full"
          style={{
            left: `${pct(it.range.start)}%`,
            width: `${Math.max(0.3, ((it.range.end - it.range.start) / span) * 100)}%`,
            top: 12 + layers.indexOf(it.layer) * 4.6 + (it.lane % 2) * 1.8,
            background: it.kind === "vigencia" ? "#FF7A1A" : colorOf(it.projectId),
            opacity: it.certainty === "hipotese" ? 0.5 : 0.95,
          }}
        />
      ))}
      <div className="absolute inset-y-0.5 rounded border border-primary/80 bg-primary/10" style={{ left: `${pct(winStart)}%`, width: `${((winEnd - winStart) / span) * 100}%` }} />
    </div>
  )
}

export function BottomBar() {
  const { indicators } = useAnalysis()
  const view = useView()
  const audit = useStudio((s) => s.audit)
  const spans: TraceSpan[] = useMemo(() => audit.map((a) => ({ id: a.id, label: a.label, kind: a.kind, status: a.status, start: a.start, end: a.end, detail: a.detail })), [audit])
  const t1 = indicators.overruns.find((o) => o.item.kind === "curso")
  const ref = ymd(indicators.ref)

  return (
    <div className="shrink-0 border-t bg-panel">
      <div className="flex h-[76px] items-stretch gap-2 px-2 py-2" style={{ paddingLeft: LABEL_W > 0 ? 8 : 0 }}>
        <Kpi label="Em execução" value={indicators.projectsRunning.length} sub={indicators.projectsRunning.map((p) => p.name.split(" — ")[0]).join(", ") || "—"} />
        <Kpi label="Planejamento" value={indicators.projectsPlanned.length} sub="propostas / hipóteses" />
        <Kpi label="Cursos ativos" value={indicators.coursesRunning.length} sub={`em ${String(ref.d).padStart(2, "0")}/${String(ref.m).padStart(2, "0")}/${ref.y}`} />
        <Kpi tone="accent" label="Após a vigência" value={indicators.overruns.length} sub={t1 ? `${t1.item.name}: ${t1.months} m (${fmtMonthsSpan(t1.after)})` : "registros datados"} wide />
        <Kpi label="Bolsas futuras" value={indicators.futureGrants.length} sub="períodos registrados" />
        <Kpi label="Decisões" value={indicators.pendingDecisions} sub="ver Modo Diretoria" />
        <Kpi label="Valores doc." value={indicators.documentedValue == null ? "—" : indicators.documentedValue.toLocaleString("pt-BR")} sub={indicators.documentedValue == null ? `nenhum conciliado (${indicators.undocumentedValues.length} a validar)` : "comprovado/formalizado"} />
        <div className="flex w-[240px] shrink-0 flex-col gap-1">
          <MiniMap />
          <button className={cn("flex items-center justify-center gap-1.5 rounded-md text-[11px] text-muted-foreground hover:bg-white/5 hover:text-foreground", view.showTrace && "text-primary")} onClick={() => view.set({ showTrace: !view.showTrace })}>
            <Activity className="size-3" /> Rastro da sessão ({audit.length}) {view.showTrace ? <ChevronDown className="size-3" /> : <ChevronUp className="size-3" />}
          </button>
        </div>
      </div>
      {view.showTrace && (
        <div className="max-h-[300px] overflow-y-auto border-t p-2">
          {spans.length === 0 ? (
            <p className="p-3 text-xs text-muted-foreground">Nenhuma alteração ainda. Cada arraste, edição, salvamento e troca de cenário aparece aqui com a duração real do gesto.</p>
          ) : (
            <AgentTrace
              spans={spans}
              runId="sessão-estúdio"
              model={`${spans.length} operações · próximos eventos: ${indicators.upcoming.map((u) => `${u.what} ${u.item.name.split(" — ")[0]} ${fmtDate(fromDay(u.day))}`).slice(0, 2).join(" · ") || "—"}`}
              autoPlay={false}
              showTokens={false}
              rowHeight={28}
              labelWidth={230}
            />
          )}
        </div>
      )}
    </div>
  )
}

function Kpi({ label, value, sub, tone, wide }: { label: string; value: number | string; sub: string; tone?: "accent"; wide?: boolean }) {
  return (
    <div className={cn("flex min-w-0 flex-col justify-center rounded-md border px-3", wide ? "flex-[1.6]" : "flex-1", tone === "accent" && "border-accent/40 bg-accent/8")}>
      <div className="truncate text-[10.5px] font-semibold text-muted-foreground">{label}</div>
      <div className={cn("font-mono text-xl leading-tight font-semibold tabular-nums", tone === "accent" && "text-accent")}>{value}</div>
      <div className="truncate text-[10.5px] text-muted-foreground">{sub}</div>
    </div>
  )
}
