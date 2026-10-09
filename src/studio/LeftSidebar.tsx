import { useState } from "react"
import { ChevronDown, ChevronRight, Copy, Lock, PanelLeftClose, PanelLeftOpen, Plus, RotateCcw, Trash2 } from "lucide-react"
import { Button, Chip } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { toDay } from "@/lib/dates"
import { itemColor, statusOf } from "@/lib/visual"
import { KIND_LABEL, type ItemKind } from "@/data/types"
import { useStudio } from "@/store/store"
import { useEffectiveItems, useProjectColor } from "@/store/hooks"
import { useView } from "@/store/view"

type Tab = "elementos" | "cenarios"

const SECTIONS: { id: string; label: string; kinds: ItemKind[]; create: ItemKind; decisions?: boolean }[] = [
  { id: "proj", label: "Projetos", kinds: ["projeto"], create: "projeto" },
  { id: "vig", label: "Planejamento e vigência", kinds: ["planejamento", "vigencia"], create: "planejamento" },
  { id: "cur", label: "Cursos e turmas", kinds: ["curso", "turma", "atividade"], create: "curso" },
  { id: "bol", label: "Bolsas", kinds: ["bolsa"], create: "bolsa" },
  { id: "ope", label: "Operação", kinds: ["operacao", "contrato"], create: "operacao" },
  { id: "mar", label: "Marcos e decisões", kinds: ["marco"], create: "marco", decisions: true },
]

export function LeftSidebar({ onCreate }: { onCreate: (kind: ItemKind) => void }) {
  const [tab, setTab] = useState<Tab>("elementos")
  const open = useView((s) => s.sidebarOpen)
  const set = useView((s) => s.set)
  if (!open) {
    return (
      <aside className="hidden w-11 shrink-0 flex-col items-center border-r bg-white pt-2 md:flex">
        <button title="Mostrar painel de elementos" aria-label="Mostrar painel de elementos" className="rounded-md p-2 text-muted-foreground hover:bg-muted" onClick={() => set({ sidebarOpen: true })}>
          <PanelLeftOpen className="size-4" />
        </button>
      </aside>
    )
  }
  return (
    <aside className="hidden w-[236px] shrink-0 flex-col border-r bg-white md:flex">
      <div className="flex items-center gap-1 border-b px-2 py-1.5">
        {(["elementos", "cenarios"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn("rounded-md px-2.5 py-1 text-xs font-semibold", tab === t ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground")}
          >
            {t === "cenarios" ? "Cenários" : "Elementos"}
          </button>
        ))}
        <button title="Recolher painel" aria-label="Recolher painel" className="ml-auto rounded-md p-1.5 text-muted-foreground hover:bg-muted" onClick={() => set({ sidebarOpen: false })}>
          <PanelLeftClose className="size-4" />
        </button>
      </div>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">{tab === "elementos" ? <Elements onCreate={onCreate} /> : <Scenarios />}</div>
    </aside>
  )
}

function Elements({ onCreate }: { onCreate: (kind: ItemKind) => void }) {
  const items = useEffectiveItems()
  const doc = useStudio((s) => s.doc)
  const selection = useStudio((s) => s.selection)
  const st = useStudio()
  const colorOf = useProjectColor()
  const [closed, setClosed] = useState<string[]>(["ope", "mar"])
  const ref = toDay(doc.settings.referenceDate)

  return (
    <div className="py-1">
      {SECTIONS.map((g) => {
        const list = items.filter((i) => g.kinds.includes(i.kind))
        const count = list.length + (g.decisions ? doc.decisions.length : 0)
        const open = !closed.includes(g.id)
        return (
          <div key={g.id} className="border-b border-border/60 last:border-0">
            <div className="group flex items-center gap-1 px-2 pt-2 pb-1.5">
              <button className="flex flex-1 items-center gap-1.5 text-left text-[12px] font-semibold text-foreground" onClick={() => setClosed(open ? [...closed, g.id] : closed.filter((c) => c !== g.id))} aria-expanded={open}>
                {open ? <ChevronDown className="size-3.5 text-muted-foreground" /> : <ChevronRight className="size-3.5 text-muted-foreground" />}
                {g.label}
                <span className="font-normal text-muted-foreground">{count}</span>
              </button>
              <button title={`Cadastrar: ${KIND_LABEL[g.create]}`} aria-label={`Novo: ${KIND_LABEL[g.create]}`} className="rounded p-0.5 text-muted-foreground opacity-70 hover:bg-muted hover:text-foreground group-hover:opacity-100" onClick={() => onCreate(g.create)}>
                <Plus className="size-3.5" />
              </button>
            </div>
            {open && (
              <div className="pb-1.5">
                {list.map((it) => {
                  const s = statusOf(it, ref)
                  return (
                    <button
                      key={it.id}
                      title={`${it.name} · ${s.label}`}
                      onClick={(e) => {
                        st.select([it.id], e.shiftKey)
                        if (!e.shiftKey) useView.getState().centerOn(it.range.start, it.range.end)
                      }}
                      className={cn("mx-1 flex w-[calc(100%-8px)] items-center gap-2 rounded-md px-2 py-1 text-left text-[12.5px] hover:bg-muted", selection.includes(it.id) && "bg-primary/10 text-primary hover:bg-primary/10")}
                    >
                      <Dot status={s.key} color={itemColor(it.kind, colorOf(it.projectId), it.color)} />
                      <span className="min-w-0 flex-1 truncate">{it.name}</span>
                      {s.pending && <span className="size-1.5 shrink-0 rounded-full bg-[#B7791F]" title="Informação a validar" />}
                      {it.changed && <span className="shrink-0 text-[9.5px] font-bold text-navy">CEN.</span>}
                      {it.locked && <Lock className="size-3 shrink-0 text-muted-foreground" />}
                    </button>
                  )
                })}
                {g.decisions &&
                  doc.decisions.map((d) => (
                    <div key={d.id} className="mx-1 flex items-center gap-2 px-2 py-1 text-[12.5px]" title={d.description}>
                      <span className={cn("size-2 shrink-0 rotate-45", d.status === "decidido" ? "bg-success" : d.status === "em_analise" ? "bg-[#B7791F]" : "border border-destructive")} />
                      <span className="min-w-0 flex-1 truncate text-foreground">{d.title}</span>
                    </div>
                  ))}
                {count === 0 && <p className="px-4 py-1 text-[11.5px] text-muted-foreground">Nenhum registro.</p>}
              </div>
            )}
          </div>
        )
      })}
      <div className="space-y-2 px-3 py-3 text-[11.5px] text-muted-foreground">
        <div className="flex items-center justify-between">
          <span>{doc.annotations.length} anotações · {doc.links.length} conexões</span>
        </div>
        <label className="block">
          <span className="mb-1 block font-semibold text-foreground">Data de referência</span>
          <input
            type="date"
            className="field"
            value={doc.settings.referenceDate}
            onChange={(e) => e.target.value && st.commit("data de referência", (d) => ({ ...d, settings: { ...d.settings, referenceDate: e.target.value } }))}
          />
        </label>
      </div>
    </div>
  )
}

function Dot({ status, color }: { status: string; color: string }) {
  if (status === "cenario") return <span className="size-2.5 shrink-0 rounded-full border-[1.5px] border-dashed" style={{ borderColor: color }} />
  if (status === "planejado") return <span className="size-2.5 shrink-0 rounded-full border-[1.5px]" style={{ borderColor: color }} />
  if (status === "nao_confirmado") return <span className="size-2.5 shrink-0 rounded-full border border-[#AEBAC8] bg-[#E4E9F0]" />
  if (status === "concluido") return <span className="size-2.5 shrink-0 rounded-full bg-success" />
  return <span className="size-2.5 shrink-0 rounded-full" style={{ background: color }} />
}

function Scenarios() {
  const doc = useStudio((s) => s.doc)
  const st = useStudio()
  return (
    <div className="space-y-2 p-2">
      <p className="px-1 text-[11.5px] leading-snug text-muted-foreground">
        A linha de base guarda os registros. Cenários guardam apenas diferenças; uma simulação nunca aparece como aprovação.
      </p>
      {doc.scenarios.map((s) => {
        const n = Object.keys(s.overrides).length + s.added.length + s.removed.length
        const active = s.id === st.scenarioId
        return (
          <div key={s.id} className={cn("rounded-lg border p-2.5", active && "border-primary/50 bg-primary/5")}>
            <div className="flex items-start gap-2">
              <input type="radio" className="mt-1" checked={active} onChange={() => st.setScenario(s.id)} aria-label={`Ativar ${s.name}`} />
              <div className="min-w-0 flex-1">
                <input
                  className="w-full rounded bg-transparent text-[12.5px] font-semibold outline-none focus:bg-muted"
                  value={s.name}
                  onChange={(e) => st.live((d) => ({ ...d, scenarios: d.scenarios.map((x) => (x.id === s.id ? { ...x, name: e.target.value } : x)) }))}
                />
                <div className="text-[11px] leading-snug text-muted-foreground">{s.description}</div>
                <div className="mt-1.5 flex flex-wrap items-center gap-1">
                  <Chip className={s.kind === "baseline" ? "text-muted-foreground" : "border-navy/40 text-navy"}>
                    {s.kind === "baseline" ? "base documental" : s.kind === "working" ? "trabalho" : "alternativo"}
                  </Chip>
                  {s.kind !== "baseline" && <Chip className="text-muted-foreground">{n} {n === 1 ? "diferença" : "diferenças"}</Chip>}
                </div>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              <Button size="sm" variant="ghost" onClick={() => st.createScenario(s.id, `${s.kind === "baseline" ? "Cenário" : s.name} (cópia)`)}>
                <Copy className="size-3" /> Derivar
              </Button>
              {s.kind !== "baseline" && (
                <Button size="sm" variant="ghost" onClick={() => st.resetScenario(s.id)}>
                  <RotateCcw className="size-3" /> Limpar
                </Button>
              )}
              {s.id !== st.scenarioId && (
                <Button size="sm" variant="ghost" active={st.compareId === s.id} onClick={() => st.setCompare(st.compareId === s.id ? null : s.id)}>
                  Comparar
                </Button>
              )}
            </div>
          </div>
        )
      })}
      <div className="px-1 pt-1 text-[11.5px] text-muted-foreground">
        <div className="mb-1 font-semibold text-foreground">Conexões</div>
        {doc.links.map((l) => (
          <div key={l.id} className="flex items-center gap-2 py-0.5">
            <span className="min-w-0 flex-1 truncate">{doc.items.find((i) => i.id === l.from)?.name ?? "?"} → {doc.items.find((i) => i.id === l.to)?.name ?? "?"}</span>
            <button title="Remover conexão" className="hover:text-destructive" onClick={() => st.deleteLink(l.id)}><Trash2 className="size-3" /></button>
          </div>
        ))}
      </div>
    </div>
  )
}
