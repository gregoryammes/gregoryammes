import { ChevronDown, ChevronUp } from "lucide-react"
import { calendarMonthsTouched, fmtDate, fmtMonthsSpan, partAfter, toDay } from "@/lib/dates"
import { acqTag, actionInfo, finRecordsIn } from "@/lib/finance"
import { statusOf } from "@/lib/visual"
import { docVigRange, offeringLabel } from "@/lib/v6"
import { useStudio } from "@/store/store"
import { useEffectiveItems } from "@/store/hooks"
import { useView } from "@/store/view"

/**
 * Bottom contextual strip: what is selected, its period, situation and what continues after the
 * vigência. Discreet and collapsible — never a permanent financial table.
 */
export function ContextSummary() {
  const doc = useStudio((s) => s.doc)
  const sid = useStudio((s) => s.scenarioId)
  const selection = useStudio((s) => s.selection)
  const items = useEffectiveItems()
  const open = useView((s) => s.showSummary)
  const it = items.find((i) => i.id === selection[0])
  if (!it) return null
  const ref = toDay(doc.settings.referenceDate)
  const vig = docVigRange(doc)
  const project = doc.projects.find((p) => p.id === it.projectId)
  const fins = finRecordsIn(doc, sid)
  const info = actionInfo(it, items, fins, ref)
  const after = vig && !it.dateUndetermined && !["vigencia", "projeto", "planejamento", "marco"].includes(it.kind) ? partAfter(it.range, vig) : null
  const later = [...info.bolsas.filter((b) => vig && b.range.end > vig.end).map((b) => `${b.shortName ?? b.name} até ${fmtDate(b.end, "month")}`), ...info.open.filter((o) => o.includes("prevista") || o.includes("parcela"))]
  return (
    <div aria-label="Resumo contextual" className="shrink-0 border-t bg-[#FBFCFE] px-4 text-[12px]">
      <button className="flex w-full items-center gap-2 py-1.5 text-left" onClick={() => useView.getState().set({ showSummary: !open })} aria-expanded={open}>
        <span className="text-[10.5px] font-bold tracking-[0.12em] text-muted-foreground uppercase">Seleção</span>
        <b className="truncate text-foreground">{it.kind === "curso" ? offeringLabel(doc, it, false) : (it.shortName ?? it.name)}</b>
        <span className="text-muted-foreground">· {project ? project.name : "sem projeto"}</span>
        {open ? <ChevronDown className="ml-auto size-3.5 text-muted-foreground" /> : <ChevronUp className="ml-auto size-3.5 text-muted-foreground" />}
      </button>
      {open && (
        <div className="flex flex-wrap gap-x-6 gap-y-1 pb-2">
          <span><span className="text-muted-foreground">Período </span>{it.dateUndetermined ? `${it.start.slice(0, 4)}–${it.end.slice(0, 4)} (datas a validar)` : `${fmtDate(it.start)} – ${fmtDate(it.end)} · ${calendarMonthsTouched(it.range)} meses`}</span>
          <span><span className="text-muted-foreground">Situação </span>{statusOf(it, ref).label}</span>
          {!["vigencia", "projeto", "planejamento", "marco"].includes(it.kind) && <span><span className="text-muted-foreground">Aquisição </span>{acqTag(info.acq).label}</span>}
          {after ? (
            <span className="font-semibold text-[#9A4A08]">Após a vigência: {calendarMonthsTouched(after)} meses ({fmtMonthsSpan(after)}) — situação financeira a verificar{later.length ? ` · também: ${later.join("; ")}` : ""}</span>
          ) : (
            <span className="text-muted-foreground">Sem compromissos registrados após a vigência de referência</span>
          )}
        </div>
      )}
    </div>
  )
}
