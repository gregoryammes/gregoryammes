import { useMemo } from "react"
import { ChevronDown, ChevronUp, Hand, Link2, MousePointer2, SquareDashed, StickyNote } from "lucide-react"
import { AgentTrace, type TraceSpan } from "@/components/ui/agent-trace"
import { fmtDate, fmtMonthsSpan, fromDay } from "@/lib/dates"
import { describeAfter } from "@/lib/analysis"
import { C } from "@/lib/visual"
import { cn } from "@/lib/utils"
import { useStudio } from "@/store/store"
import { useAnalysis } from "@/store/hooks"
import { useView, ZOOM_PRESETS, type Tool } from "@/store/view"

const TOOLS: { id: Tool; icon: typeof Hand; label: string; key: string }[] = [
  { id: "select", icon: MousePointer2, label: "Selecionar", key: "V" },
  { id: "hand", icon: Hand, label: "Mover tela", key: "H" },
  { id: "note", icon: StickyNote, label: "Anotar", key: "N" },
  { id: "connect", icon: Link2, label: "Conectar", key: "C" },
  { id: "quadrant", icon: SquareDashed, label: "Quadrante", key: "Q" },
]

/** Figma-style floating tools: editing stays one click away without crowding the header. */
export function CanvasToolbar() {
  const view = useView()
  const snap = useStudio((s) => s.doc.settings.snap)
  const commit = useStudio((s) => s.commit)
  return (
    <div className="pointer-events-auto absolute bottom-4 left-[276px] z-20 flex items-center gap-0.5 rounded-xl border bg-white p-1 shadow-lg shadow-slate-900/10">
      {TOOLS.map((t) => (
        <button
          key={t.id}
          title={`${t.label} (${t.key})`}
          onClick={() => view.set({ tool: t.id, connectFrom: null })}
          aria-label={t.label}
          className={cn("flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-medium", view.tool === t.id ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground")}
        >
          <t.icon className="size-3.5" /> {view.tool === t.id && t.label}
        </button>
      ))}
      <span className="mx-1 h-5 w-px bg-border" />
      <select aria-label="Zoom" title="Zoom — muda só a escala, nunca as datas" className="rounded border bg-white px-1.5 py-1 text-xs text-foreground" value=""
        onChange={(e) => { const z = ZOOM_PRESETS[e.target.value as keyof typeof ZOOM_PRESETS]; if (z) { view.setZoom(z.pxPerDay, e.target.value === "anual" ? "year" : e.target.value === "semestral" ? "sem" : null); view.set({ range: null }) } }}>
        <option value="">Zoom…</option>
        {Object.entries(ZOOM_PRESETS).map(([k, z]) => <option key={k} value={k}>{z.label}</option>)}
      </select>
      <label className="flex items-center gap-1.5 px-1 text-xs text-muted-foreground" title="Encaixe automático ao arrastar">
        <select aria-label="Encaixe automático"
          className="rounded border bg-white px-1.5 py-1 text-xs text-foreground"
          value={snap}
          onChange={(e) => commit("encaixe", (d) => ({ ...d, settings: { ...d.settings, snap: e.target.value as typeof d.settings.snap } }))}
        >
          <option value="none">Encaixe livre</option>
          <option value="day">Encaixe: dia</option>
          <option value="week">Encaixe: semana</option>
          <option value="month">Encaixe: mês</option>
          <option value="quarter">Encaixe: trimestre</option>
        </select>
      </label>
    </div>
  )
}

/** Concise legend, one line, like a printed chart. */
export function Legend() {
  const sw = (fill: string, opts: { stroke?: string; dash?: string; op?: number; stripes?: boolean } = {}) => (
    <svg width="26" height="12" aria-hidden="true">
      {opts.stripes && (
        <defs>
          <pattern id="lg-st" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
            <rect width="6" height="6" fill={C.blue} />
            <line x1="0" y1="0" x2="0" y2="6" stroke={C.after} strokeWidth="2.4" strokeOpacity="0.7" />
          </pattern>
        </defs>
      )}
      <rect x="1" y="1" width="24" height="10" rx="2" fill={opts.stripes ? "url(#lg-st)" : fill} fillOpacity={opts.op ?? 1} stroke={opts.stroke ?? "none"} strokeWidth={1.4} strokeDasharray={opts.dash} />
    </svg>
  )
  const mk = (shape: React.ReactNode) => <svg width="16" height="14" aria-hidden="true">{shape}</svg>
  const items: [React.ReactNode, string][] = [
    [sw(C.blue), "execução educacional"],
    [sw(C.blue, { op: 0.6 }), "período encerrado"],
    [sw("", { stripes: true }), "após a vigência (≠ sem cobertura)"],
    [sw("#fff", { stroke: C.scenario, dash: "5 3" }), "cenário / hipótese"],
    [sw(C.plan, { op: 0.25, stroke: C.plan }), "planejado"],
    [sw("#E4E9F0", { stroke: "#B8C3D1", dash: "2 2" }), "não confirmado"],
    [mk(<circle cx="8" cy="7" r="5" fill={C.paid} />), "evento financeiro comprovado"],
    [mk(<circle cx="8" cy="7" r="5" fill={C.slate} />), "realizado, comprovação pendente"],
    [mk(<path d="M8,2 L13,7 L8,12 L3,7 Z" fill="#fff" stroke={C.muted} strokeWidth="1.5" strokeDasharray="2 2" />), "previsto (NF / pagamento)"],
    [<svg key="w" width="26" height="14" aria-hidden="true"><path d="M2,3 v8 M2,7 H24 M24,3 v8" fill="none" stroke={C.muted} strokeWidth="1.5" strokeDasharray="3 2" /></svg>, "janela prevista, data a definir"],
    [<svg key="d" width="26" height="12" aria-hidden="true"><line x1="1" x2="25" y1="6" y2="6" stroke={C.plan} strokeWidth="2" strokeDasharray="2 3" /></svg>, "data a validar"],
    [<svg key="g" width="14" height="12" aria-hidden="true"><circle cx="7" cy="6" r="4.5" fill="#FFF4D6" stroke={C.amber} /></svg>, "informação a validar"],
  ]
  return (
    <div className="scroll-thin flex items-center gap-x-3.5 overflow-x-auto text-[11px] whitespace-nowrap text-muted-foreground">
      <span className="flex items-center gap-1.5"><span className="h-3 w-0.5 bg-[#5FA548]" /> referência (hoje)</span>
      <span className="flex items-center gap-1.5"><span className="h-3 w-0.5 bg-[#C2410C]" /> fim da vigência (documental)</span>
      <span className="flex items-center gap-1.5"><span className="h-3 border-l-2 border-dashed border-[#4338CA]" /> vigência em cenário</span>
      {items.map(([g, l], i) => (
        <span key={i} className="flex items-center gap-1.5">{g}{l}</span>
      ))}
    </div>
  )
}

/** Discreet, collapsible indicators. Collapsed by default so the schedule keeps the space. */
export function IndicatorStrip() {
  const { indicators, items } = useAnalysis()
  const view = useView()
  const audit = useStudio((s) => s.audit)
  const doc = useStudio((s) => s.doc)
  const spans: TraceSpan[] = useMemo(() => audit.map((a) => ({ id: a.id, label: a.label, kind: a.kind, status: a.status, start: a.start, end: a.end, detail: a.detail })), [audit])
  const running = indicators.projectsRunning.map((p) => doc.projects.find((x) => x.id === p.projectId)?.name ?? p.name).join(", ") || "—"
  const course = indicators.overruns.find((o) => o.item.kind === "curso")
  const open = view.indicatorsOpen

  return (
    <div className="shrink-0 border-t bg-white">
      <div className="flex min-h-10 items-center gap-x-5 px-4 py-1.5">
        <div className="min-w-0 flex-1"><Legend /></div>
        <button
          className="ml-auto flex shrink-0 items-center gap-3 rounded-md px-2 py-1 text-xs whitespace-nowrap text-muted-foreground hover:bg-muted"
          onClick={() => view.set({ indicatorsOpen: !open })}
          aria-expanded={open}
        >
          <span><b className="text-foreground">{running}</b> em execução</span>
          <span><b className="text-foreground">{indicators.coursesRunning.length}</b> curso(s) ativo(s)</span>
          <span><b className="text-[#9A4A08]">{indicators.overruns.length}</b> após a vigência</span>
          <span><b className="text-foreground">{indicators.pendingDecisions}</b> decisões pendentes</span>
          {open ? <ChevronDown className="size-3.5" /> : <ChevronUp className="size-3.5" />}
        </button>
      </div>
      {open && (
        <div className="grid max-h-[300px] grid-cols-1 gap-4 overflow-y-auto border-t px-4 py-3 text-[12.5px] md:grid-cols-3">
          <div>
            <h4 className="mb-1.5 text-[11px] font-bold tracking-wider text-muted-foreground uppercase">Após a vigência de referência</h4>
            {indicators.overruns.length === 0 && <p className="text-muted-foreground">Nenhum registro datado neste cenário.</p>}
            <ul className="space-y-1">
              {indicators.overruns.map((o) => (
                <li key={o.item.id}><b>{o.item.name}</b> — {describeAfter(o)}</li>
              ))}
            </ul>
            {course && <p className="mt-1.5 text-[11.5px] text-muted-foreground">Indicador temporal ({fmtMonthsSpan(course.after)}). Não afirma ausência de pagamento nem de cobertura.</p>}
          </div>
          <div>
            <h4 className="mb-1.5 text-[11px] font-bold tracking-wider text-muted-foreground uppercase">Próximos eventos (12 meses)</h4>
            <ul className="space-y-1">
              {indicators.upcoming.map((u, i) => (
                <li key={i}>{fmtDate(fromDay(u.day))} · {u.what} de <b>{u.item.name}</b></li>
              ))}
            </ul>
            <p className="mt-2 text-[11.5px] text-muted-foreground">
              Valores documentados: {indicators.documentedValue == null ? `nenhum conciliado (${indicators.undocumentedValues.length} a validar)` : indicators.documentedValue.toLocaleString("pt-BR")} · {items.length} registros no cenário
            </p>
          </div>
          <div className="min-w-0">
            <h4 className="mb-1.5 text-[11px] font-bold tracking-wider text-muted-foreground uppercase">Histórico da sessão</h4>
            {spans.length === 0 ? (
              <p className="text-muted-foreground">Cada arraste, edição, salvamento e troca de cenário aparece aqui com a duração real do gesto.</p>
            ) : (
              <AgentTrace spans={spans} runId="sessão" model={`${spans.length} operações`} autoPlay={false} showTokens={false} rowHeight={26} labelWidth={170} />
            )}
          </div>
        </div>
      )}
    </div>
  )
}
