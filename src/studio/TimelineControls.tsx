import { useState } from "react"
import { Check, ChevronDown, Eye, EyeOff, Layers, Users, Wallet, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { FIN_FILTERS, type FinFilter } from "@/lib/finance"
import { useStudio } from "@/store/store"
import { useEffectiveItems } from "@/store/hooks"
import { useView, type DisplayMode } from "@/store/view"

const MODES: { id: DisplayMode; label: string; hint: string }[] = [
  { id: "projects", label: "Somente Projetos", hint: "Nível 1 — as três faixas P1, P2 e P3" },
  { id: "courses", label: "Projetos + Cursos", hint: "Nível 2 — projetos e ações principais, cada uma recolhida em uma linha" },
  { id: "details", label: "Projetos + Cursos + Detalhes", hint: "Nível 3 — ações expandidas: aquisição, bolsas, NF, materiais" },
]
const LEGACY: { id: DisplayMode; label: string; hint: string }[] = [
  { id: "all", label: "Matriz por categorias (V6)", hint: "Grupos independentes: planejamento, execução, bolsas, operação" },
  { id: "filtered", label: "Somente atividades filtradas", hint: "Atividades das turmas selecionadas, com a vigência de referência" },
]

type Menu = "projects" | "turmas" | null

/**
 * Timeline header controls. Everything here is a view state: hiding a project, filtering a turma or
 * a financial situation never edits, archives or unlinks a record.
 */
export function TimelineControls() {
  const view = useView()
  const doc = useStudio((s) => s.doc)
  const items = useEffectiveItems()
  const [menu, setMenu] = useState<Menu>(null)
  const turmas = doc.turmas ?? []
  const generations = doc.generations ?? []
  const togglePro = (id: string) =>
    view.set({ hiddenProjects: view.hiddenProjects.includes(id) ? view.hiddenProjects.filter((x) => x !== id) : [...view.hiddenProjects, id] })
  const toggleTurma = (id: string) =>
    view.set({ turmaFilter: view.turmaFilter.includes(id) ? view.turmaFilter.filter((x) => x !== id) : [...view.turmaFilter, id] })
  const turmaLabel =
    view.turmaFilter.length === 0 ? "Todas" : view.turmaFilter.length === 1 ? (turmas.find((t) => t.id === view.turmaFilter[0])?.name ?? "1 turma") : `${view.turmaFilter.length} turmas`
  const hier = view.displayMode === "courses" || view.displayMode === "details"
  const fitProject = (pid: string) => {
    const mine = items.filter((i) => i.projectId === pid && !i.hidden)
    if (!mine.length) return
    view.fit(Math.min(...mine.map((m) => m.range.start)), Math.max(...mine.map((m) => m.range.end)))
    view.set({ range: null })
  }

  return (
    <div className="relative z-20 flex h-10 shrink-0 items-center gap-2.5 border-b bg-white px-3 text-xs">
      <label className="flex items-center gap-1.5 text-muted-foreground">
        <Layers className="size-3.5" />
        <span className="hidden xl:inline">Exibição</span>
        <select
          aria-label="Exibição da timeline"
          className="field !w-[218px] !py-1 !text-xs font-semibold text-foreground"
          value={view.displayMode}
          onChange={(e) => view.set({ displayMode: e.target.value as DisplayMode, expanded: [], collapsedActions: [] })}
          title={[...MODES, ...LEGACY].find((m) => m.id === view.displayMode)?.hint}
        >
          {MODES.map((m) => (
            <option key={m.id} value={m.id}>{m.label}</option>
          ))}
          <optgroup label="Outras visões">
            {LEGACY.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </optgroup>
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
              title={`${on ? "Ocultar" : "Mostrar"} ${p.name} e as ações exclusivas dele (só a visualização)`}
              onClick={() => togglePro(p.id)}
              className={cn("flex h-7 items-center gap-1.5 rounded-md border px-2 font-bold", on ? "border-transparent text-white" : "border-dashed bg-white text-muted-foreground")}
              style={on ? { background: p.color } : { borderColor: p.color }}
            >
              {on ? <Eye className="size-3" /> : <EyeOff className="size-3" />} {p.short}
            </button>
          )
        })}
        {view.hiddenProjects.length > 0 ? (
          <button className="ml-0.5 text-primary hover:underline" onClick={() => view.set({ hiddenProjects: [] })}>mostrar todos</button>
        ) : (
          <span className="ml-0.5 text-muted-foreground">Todos</span>
        )}
        <div className="relative">
          <Button size="icon" variant="ghost" className="!size-7" aria-label="Opções de projetos" title="Opções de projetos: mostrar somente um, ajustar período, ocultar concluídas e pagas" aria-expanded={menu === "projects"} active={view.hideSettled.length > 0} onClick={() => setMenu(menu === "projects" ? null : "projects")}>
            <ChevronDown className="size-3.5" />
          </Button>
          {menu === "projects" && (
            <Popover label="Opções de projetos" onClose={() => setMenu(null)}>
              <button className="block w-full px-3 py-1.5 text-left hover:bg-muted" onClick={() => view.set({ hiddenProjects: [] })}>Mostrar todos os projetos</button>
              {doc.projects.map((p) => (
                <button key={p.id} className="block w-full px-3 py-1.5 text-left hover:bg-muted" onClick={() => view.set({ hiddenProjects: doc.projects.filter((x) => x.id !== p.id).map((x) => x.id) })}>
                  Mostrar somente {p.name}
                </button>
              ))}
              <div className="mt-1 border-t px-3 pt-2 pb-1 text-[11px] font-semibold text-muted-foreground">Ajustar período ao projeto</div>
              <div className="flex gap-1 px-3 pb-2">
                {doc.projects.map((p) => (
                  <Button key={p.id} size="sm" variant="outline" onClick={() => fitProject(p.id)}>{p.short}</Button>
                ))}
              </div>
              <div className="border-t px-3 pt-2 pb-1 text-[11px] font-semibold text-muted-foreground">Ocultar atividades concluídas e aquisições pagas</div>
              {doc.projects.map((p) => {
                const on = view.hideSettled.includes(p.id)
                return (
                  <label key={p.id} className="flex cursor-pointer items-center gap-2 px-3 py-1.5 hover:bg-muted">
                    <input type="checkbox" aria-label={`Ocultar concluídas e pagas do ${p.name}`} checked={on} onChange={() => view.set({ hideSettled: on ? view.hideSettled.filter((x) => x !== p.id) : [...view.hideSettled, p.id] })} />
                    {p.name}
                  </label>
                )
              })}
              <p className="px-3 pt-1 pb-2 text-[11px] leading-snug text-muted-foreground">
                Só some o que terminou <b>e</b> tem aquisição registrada como paga <b>e</b> não tem compromisso aberto (parcela, NF, pagamento ou comprovação pendente). O restante continua visível, com aviso.
              </p>
            </Popover>
          )}
        </div>
      </div>

      <div className="relative">
        <Button size="sm" variant="outline" active={view.turmaFilter.length > 0} onClick={() => setMenu(menu === "turmas" ? null : "turmas")} aria-expanded={menu === "turmas"}>
          <Users className="size-3.5" /> Turma: <b className="max-w-[150px] truncate">{turmaLabel}</b> <ChevronDown className="size-3" />
        </Button>
        {menu === "turmas" && (
          <Popover label="Filtro de turmas" onClose={() => setMenu(null)} width={320}>
            <button className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-muted" onClick={() => view.set({ turmaFilter: [] })}>
              <span className={cn("grid size-4 place-items-center rounded border", view.turmaFilter.length === 0 && "border-primary bg-primary text-white")}>{view.turmaFilter.length === 0 && <Check className="size-3" />}</span>
              Todas as turmas
            </button>
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
            <div className="px-3 pt-2 pb-1 text-[11px] font-semibold text-muted-foreground">Gerações</div>
            {generations.length === 0 ? (
              <p className="px-3 pb-1 text-[11px] text-muted-foreground">Nenhuma geração cadastrada (o vínculo entre etapas só aparece quando documentado).</p>
            ) : (
              generations.map((g) => {
                const ids = turmas.filter((t) => t.generationId === g.id).map((t) => t.id)
                const on = ids.length > 0 && ids.every((id) => view.turmaFilter.includes(id))
                return (
                  <button key={g.id} disabled={!ids.length} className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-muted disabled:opacity-50" onClick={() => view.set({ turmaFilter: on ? view.turmaFilter.filter((x) => !ids.includes(x)) : [...new Set([...view.turmaFilter, ...ids])] })}>
                    <span className={cn("grid size-4 place-items-center rounded border", on && "border-primary bg-primary text-white")}>{on && <Check className="size-3" />}</span>
                    {g.name} <span className="text-muted-foreground">· {ids.length} turma(s)</span>
                  </button>
                )
              })
            )}
            <div className="mt-1 flex items-center gap-2 border-t px-3 pt-2 pb-1.5">
              <span className="text-[11px] text-muted-foreground">Sem relação:</span>
              <Button size="sm" variant="outline" active={view.turmaFilterMode === "dim"} onClick={() => view.set({ turmaFilterMode: "dim" })}>Atenuar</Button>
              <Button size="sm" variant="outline" active={view.turmaFilterMode === "hide"} onClick={() => view.set({ turmaFilterMode: "hide" })}>Ocultar</Button>
            </div>
          </Popover>
        )}
      </div>
      {view.turmaFilter.length > 0 && (
        <button className="flex items-center gap-1 text-primary hover:underline" onClick={() => view.set({ turmaFilter: [] })} aria-label="Limpar filtro de turma">
          <X className="size-3" /> limpar
        </button>
      )}

      <label className={cn("flex items-center gap-1.5 text-muted-foreground", !hier && "opacity-50")} title={hier ? "Situação financeira registrada das ações" : "Disponível nas visões Projetos + Cursos"}>
        <Wallet className="size-3.5" />
        <span className="hidden xl:inline">Financeiro</span>
        <select aria-label="Situação financeira" disabled={!hier} className="field !w-[178px] !py-1 !text-xs font-semibold text-foreground" value={view.finFilter} onChange={(e) => view.set({ finFilter: e.target.value as FinFilter })}>
          {FIN_FILTERS.map((f) => (
            <option key={f.id} value={f.id} title={f.hint}>{f.label}</option>
          ))}
        </select>
      </label>

      {view.displayMode === "filtered" && view.turmaFilter.length === 0 && (
        <span className="text-muted-foreground">Selecione uma ou mais turmas para filtrar as atividades.</span>
      )}
      <span className="ml-auto hidden text-[11px] text-muted-foreground 2xl:inline">Filtros afetam só a visualização — nenhum registro é alterado.</span>
    </div>
  )
}

function Popover({ children, onClose, label, width = 300 }: { children: React.ReactNode; onClose: () => void; label: string; width?: number }) {
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div role="dialog" aria-label={label} className="absolute top-9 left-0 z-50 rounded-lg border bg-white py-1 text-xs shadow-xl shadow-slate-900/10" style={{ width }}>
        {children}
      </div>
    </>
  )
}
