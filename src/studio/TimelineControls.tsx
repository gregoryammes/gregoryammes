import { useState } from "react"
import { Check, ChevronDown, Eye, EyeOff, Users, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useStudio } from "@/store/store"
import { useView, type DisplayMode } from "@/store/view"

const MODES: { id: DisplayMode; label: string; hint: string }[] = [
  { id: "projects", label: "Somente Projetos", hint: "Apenas os ciclos P1, P2 e P3" },
  { id: "all", label: "Projetos + Atividades", hint: "Matriz completa por grupos" },
  { id: "filtered", label: "Somente Atividades Filtradas", hint: "Atividades das turmas selecionadas, com a vigência de referência" },
]

/**
 * Timeline header controls. Everything here is a view state: hiding a project or filtering a turma
 * never edits, archives or unlinks a record.
 */
export function TimelineControls() {
  const view = useView()
  const doc = useStudio((s) => s.doc)
  const [open, setOpen] = useState(false)
  const turmas = doc.turmas ?? []
  const togglePro = (id: string) =>
    view.set({ hiddenProjects: view.hiddenProjects.includes(id) ? view.hiddenProjects.filter((x) => x !== id) : [...view.hiddenProjects, id] })
  const toggleTurma = (id: string) =>
    view.set({ turmaFilter: view.turmaFilter.includes(id) ? view.turmaFilter.filter((x) => x !== id) : [...view.turmaFilter, id] })
  const turmaLabel =
    view.turmaFilter.length === 0 ? "Todas" : view.turmaFilter.length === 1 ? (turmas.find((t) => t.id === view.turmaFilter[0])?.name ?? "1 turma") : `${view.turmaFilter.length} turmas`

  return (
    <div className="relative z-20 flex h-10 shrink-0 items-center gap-3 border-b bg-white px-3 text-xs">
      <label className="flex items-center gap-1.5 text-muted-foreground">
        Exibição
        <select
          aria-label="Exibição da timeline"
          className="field !w-[214px] !py-1 !text-xs font-semibold text-foreground"
          value={view.displayMode}
          onChange={(e) => view.set({ displayMode: e.target.value as DisplayMode })}
          title={MODES.find((m) => m.id === view.displayMode)?.hint}
        >
          {MODES.map((m) => (
            <option key={m.id} value={m.id}>{m.label}</option>
          ))}
        </select>
      </label>

      <div className="flex items-center gap-1" role="group" aria-label="Projetos visíveis">
        {doc.projects.map((p) => {
          const on = !view.hiddenProjects.includes(p.id)
          return (
            <button
              key={p.id}
              type="button"
              aria-pressed={on}
              title={`${on ? "Ocultar" : "Mostrar"} ${p.name} e suas atividades (só a visualização)`}
              onClick={() => togglePro(p.id)}
              className={cn(
                "flex h-7 items-center gap-1.5 rounded-md border px-2 font-bold",
                on ? "border-transparent text-white" : "border-dashed bg-white text-muted-foreground",
              )}
              style={on ? { background: p.color } : { borderColor: p.color }}
            >
              {on ? <Eye className="size-3" /> : <EyeOff className="size-3" />} {p.short}
            </button>
          )
        })}
        {view.hiddenProjects.length > 0 && (
          <button className="ml-1 text-primary hover:underline" onClick={() => view.set({ hiddenProjects: [] })}>mostrar todos</button>
        )}
      </div>

      <div className="relative">
        <Button size="sm" variant="outline" active={view.turmaFilter.length > 0} onClick={() => setOpen(!open)} aria-expanded={open}>
          <Users className="size-3.5" /> Turma: <b className="max-w-[170px] truncate">{turmaLabel}</b> <ChevronDown className="size-3" />
        </Button>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <div role="dialog" aria-label="Filtro de turmas" className="absolute top-9 left-0 z-50 w-[320px] rounded-lg border bg-white py-1 shadow-xl shadow-slate-900/10">
              <div className="px-3 pt-2 pb-1 text-[11px] font-semibold text-muted-foreground">Turmas cadastradas</div>
              {turmas.length === 0 && <p className="px-3 py-2 text-muted-foreground">Nenhuma turma cadastrada. Cadastre pelo painel de um curso.</p>}
              {turmas.map((t) => {
                const on = view.turmaFilter.includes(t.id)
                return (
                  <button key={t.id} className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-muted" onClick={() => toggleTurma(t.id)}>
                    <span className={cn("grid size-4 place-items-center rounded border", on && "border-primary bg-primary text-white")}>{on && <Check className="size-3" />}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-foreground">{t.name}</span>
                      <span className="block text-[11px] text-muted-foreground">entrada {t.entryYear} · {t.status === "hipotese" ? "cenário" : "registrada"}</span>
                    </span>
                  </button>
                )
              })}
              <div className="mt-1 flex items-center gap-2 border-t px-3 pt-2 pb-1.5">
                <span className="text-[11px] text-muted-foreground">Sem relação:</span>
                <Button size="sm" variant="outline" active={view.turmaFilterMode === "dim"} onClick={() => view.set({ turmaFilterMode: "dim" })}>Atenuar</Button>
                <Button size="sm" variant="outline" active={view.turmaFilterMode === "hide"} onClick={() => view.set({ turmaFilterMode: "hide" })}>Ocultar</Button>
              </div>
            </div>
          </>
        )}
      </div>
      {view.turmaFilter.length > 0 && (
        <button className="flex items-center gap-1 text-primary hover:underline" onClick={() => view.set({ turmaFilter: [] })} aria-label="Limpar filtro de turma">
          <X className="size-3" /> limpar filtro
        </button>
      )}
      {view.displayMode === "filtered" && view.turmaFilter.length === 0 && (
        <span className="text-muted-foreground">Selecione uma ou mais turmas para filtrar as atividades.</span>
      )}
      <span className="ml-auto hidden text-[11px] text-muted-foreground xl:inline">Filtros afetam só a visualização — nenhum registro é alterado.</span>
    </div>
  )
}
