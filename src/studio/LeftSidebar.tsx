import { useState } from "react"
import { ChevronDown, ChevronRight, Copy, Eye, EyeOff, Lock, Plus, RotateCcw, Trash2 } from "lucide-react"
import { Button, Chip } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { fmtDate } from "@/lib/dates"
import { LAYERS, KIND_LABEL, type ItemKind } from "@/data/types"
import { useStudio } from "@/store/store"
import { useEffectiveItems, useProjectColor } from "@/store/hooks"
import { useView } from "@/store/view"

type Tab = "camadas" | "elementos" | "cenarios"

const GROUPS: { kind: ItemKind | "anotacao" | "conexao"; label: string }[] = [
  { kind: "projeto", label: "Projetos" },
  { kind: "curso", label: "Cursos" },
  { kind: "turma", label: "Turmas" },
  { kind: "bolsa", label: "Bolsas" },
  { kind: "atividade", label: "Atividades" },
  { kind: "contrato", label: "Contratos" },
  { kind: "marco", label: "Marcos" },
  { kind: "vigencia", label: "Vigências" },
  { kind: "planejamento", label: "Planejamento" },
  { kind: "operacao", label: "Operação" },
  { kind: "anotacao", label: "Anotações" },
  { kind: "conexao", label: "Conexões" },
]

export function LeftSidebar({ onCreate }: { onCreate: (kind: ItemKind) => void }) {
  const [tab, setTab] = useState<Tab>("elementos")
  return (
    <aside className="hidden w-[264px] shrink-0 flex-col border-r bg-panel md:flex">
      <div className="flex gap-0.5 border-b p-1.5">
        {(["elementos", "camadas", "cenarios"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn("flex-1 rounded-md py-1.5 text-xs font-semibold capitalize transition-colors", tab === t ? "bg-white/8 text-foreground" : "text-muted-foreground hover:text-foreground")}
          >
            {t === "cenarios" ? "Cenários" : t}
          </button>
        ))}
      </div>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        {tab === "elementos" && <Elements onCreate={onCreate} />}
        {tab === "camadas" && <Layers />}
        {tab === "cenarios" && <Scenarios />}
      </div>
    </aside>
  )
}

function Elements({ onCreate }: { onCreate: (kind: ItemKind) => void }) {
  const items = useEffectiveItems()
  const doc = useStudio((s) => s.doc)
  const selection = useStudio((s) => s.selection)
  const selAnn = useStudio((s) => s.selectedAnnotation)
  const st = useStudio()
  const colorOf = useProjectColor()
  const [closed, setClosed] = useState<string[]>(["planejamento", "operacao", "conexao"])
  const byId = new Map(items.map((i) => [i.id, i]))

  return (
    <div className="py-1">
      {GROUPS.map((g) => {
        const list =
          g.kind === "anotacao" ? doc.annotations : g.kind === "conexao" ? doc.links : items.filter((i) => i.kind === g.kind)
        const open = !closed.includes(g.kind)
        return (
          <div key={g.kind}>
            <div className="group flex items-center gap-1 px-2 pt-2 pb-1">
              <button className="flex flex-1 items-center gap-1 text-[11px] font-bold tracking-wider text-muted-foreground uppercase" onClick={() => setClosed(open ? [...closed, g.kind] : closed.filter((c) => c !== g.kind))}>
                {open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
                {g.label}
                <span className="ml-1 font-mono text-[10px] text-muted-foreground/70">{list.length}</span>
              </button>
              {g.kind !== "anotacao" && g.kind !== "conexao" && (
                <button title={`Novo: ${KIND_LABEL[g.kind]}`} className="rounded p-0.5 text-muted-foreground opacity-60 hover:bg-white/10 hover:text-foreground group-hover:opacity-100" onClick={() => onCreate(g.kind as ItemKind)}>
                  <Plus className="size-3.5" />
                </button>
              )}
              {g.kind === "anotacao" && (
                <button title="Nova anotação: escolha a ferramenta e clique no canvas" className="rounded p-0.5 text-muted-foreground opacity-60 hover:bg-white/10 group-hover:opacity-100" onClick={() => useView.getState().set({ tool: "note" })}>
                  <Plus className="size-3.5" />
                </button>
              )}
              {g.kind === "conexao" && (
                <button title="Nova conexão: clique na origem e no destino" className="rounded p-0.5 text-muted-foreground opacity-60 hover:bg-white/10 group-hover:opacity-100" onClick={() => useView.getState().set({ tool: "connect", connectFrom: null })}>
                  <Plus className="size-3.5" />
                </button>
              )}
            </div>
            {open && g.kind === "anotacao" &&
              doc.annotations.map((a) => (
                <Row key={a.id} active={selAnn === a.id} onClick={() => useStudio.setState({ selectedAnnotation: a.id, selection: [] })} dot="#FFD08A"
                  title={a.text} sub={a.linkedItemId ? `vinculada a ${byId.get(a.linkedItemId)?.name ?? "—"}` : `livre · ${fmtDate(a.date)}`} />
              ))}
            {open && g.kind === "conexao" &&
              doc.links.map((l) => (
                <Row key={l.id} dot="#9FB6E8" title={`${byId.get(l.from)?.name ?? "?"} → ${byId.get(l.to)?.name ?? "?"}`} sub={l.label ?? "conexão"}
                  onClick={() => st.select([l.from, l.to])}
                  action={<button title="Remover conexão" className="text-muted-foreground hover:text-destructive" onClick={(e) => { e.stopPropagation(); st.deleteLink(l.id) }}><Trash2 className="size-3" /></button>} />
              ))}
            {open && g.kind !== "anotacao" && g.kind !== "conexao" &&
              items.filter((i) => i.kind === g.kind).map((it) => (
                <Row
                  key={it.id}
                  active={selection.includes(it.id)}
                  dot={colorOf(it.projectId)}
                  title={it.name}
                  sub={it.dateUndetermined ? "datas não comprovadas" : `${fmtDate(it.start, it.precision)} – ${fmtDate(it.end, it.precision)}`}
                  badges={
                    <>
                      {it.changed && <Chip className="border-[#C4B5FD]/50 px-1 py-0 text-[9.5px] text-[#C4B5FD]">Δ</Chip>}
                      {it.locked && <Lock className="size-3 text-muted-foreground" />}
                      {it.hidden && <EyeOff className="size-3 text-muted-foreground" />}
                    </>
                  }
                  onClick={(e) => {
                    st.select([it.id], e.shiftKey)
                    if (!e.shiftKey) useView.getState().centerOn(it.range.start, it.range.end)
                  }}
                />
              ))}
          </div>
        )
      })}
    </div>
  )
}

function Row(p: { title: string; sub?: string; dot?: string; active?: boolean; badges?: React.ReactNode; action?: React.ReactNode; onClick?: (e: React.MouseEvent) => void }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={p.onClick}
      onKeyDown={(e) => e.key === "Enter" && p.onClick?.(e as unknown as React.MouseEvent)}
      className={cn("mx-1 flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 hover:bg-white/5", p.active && "bg-primary/15 hover:bg-primary/20")}
    >
      <span className="mt-1.5 size-2 shrink-0 rounded-full" style={{ background: p.dot }} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12.5px] leading-tight font-medium">{p.title}</div>
        {p.sub && <div className="truncate text-[11px] text-muted-foreground">{p.sub}</div>}
      </div>
      <div className="flex items-center gap-1 pt-0.5">{p.badges}{p.action}</div>
    </div>
  )
}

function Layers() {
  const doc = useStudio((s) => s.doc)
  const st = useStudio()
  const items = useEffectiveItems()
  const { layersHidden, layersCollapsed } = doc.settings
  const toggle = (key: "layersHidden" | "layersCollapsed", id: string) =>
    st.commit(key === "layersHidden" ? "visibilidade de camada" : "recolher camada", (d) => {
      const cur = d.settings[key] as string[]
      return { ...d, settings: { ...d.settings, [key]: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] } }
    })
  return (
    <div className="space-y-0.5 p-2">
      {LAYERS.map((L, i) => {
        const hidden = layersHidden.includes(L.id)
        const collapsed = layersCollapsed.includes(L.id)
        return (
          <div key={L.id} className={cn("flex items-center gap-2 rounded-md px-2 py-2 hover:bg-white/5", hidden && "opacity-50")}>
            <span className="w-4 font-mono text-[10px] text-muted-foreground">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <div className="text-[12.5px] font-semibold">{L.label}</div>
              <div className="truncate text-[11px] text-muted-foreground">{L.hint} · {items.filter((x) => x.layer === L.id).length}</div>
            </div>
            <button title={collapsed ? "Expandir" : "Recolher"} className="rounded p-1 text-muted-foreground hover:bg-white/10" onClick={() => toggle("layersCollapsed", L.id)}>
              {collapsed ? <ChevronRight className="size-3.5" /> : <ChevronDown className="size-3.5" />}
            </button>
            <button title={hidden ? "Mostrar camada" : "Ocultar camada"} className="rounded p-1 text-muted-foreground hover:bg-white/10" onClick={() => toggle("layersHidden", L.id)}>
              {hidden ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
            </button>
          </div>
        )
      })}
      <div className="mt-3 rounded-lg border p-3">
        <div className="mb-1.5 text-[11px] font-bold tracking-wider text-muted-foreground uppercase">Data de referência</div>
        <input
          type="date"
          className="field"
          value={doc.settings.referenceDate}
          onChange={(e) => e.target.value && st.commit("data de referência", (d) => ({ ...d, settings: { ...d.settings, referenceDate: e.target.value } }))}
        />
        <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">Marcador vertical azul. Usado para “em andamento” e “próximos eventos”.</p>
      </div>
      <Legend />
    </div>
  )
}

export function Legend() {
  const rows: [React.ReactNode, string][] = [
    [<rect key="a" x="1" y="3" width="34" height="12" rx="4" fill="#2EA8FF" fillOpacity="0.92" />, "Sólida — execução documentada"],
    [<g key="b"><rect x="1" y="3" width="34" height="12" rx="4" fill="#2EA8FF" fillOpacity="0.72" /><circle cx="30" cy="9" r="4" fill="#0A1633" stroke="#FFD08A" /></g>, "Com “!” — pendência documental"],
    [<rect key="c" x="1" y="3" width="34" height="12" rx="4" fill="#8EA2D6" fillOpacity="0.22" stroke="#8EA2D6" strokeDasharray="10 4" />, "Contorno longo — planejado"],
    [<rect key="d" x="1" y="3" width="34" height="12" rx="4" fill="#A78BFA" fillOpacity="0.16" stroke="#A78BFA" strokeDasharray="6 4" />, "Tracejada — hipótese / proposta"],
    [<rect key="e" x="1" y="3" width="34" height="12" rx="4" fill="#7C8DB5" fillOpacity="0.28" stroke="#7C8DB5" strokeDasharray="2 3" />, "Pontilhada — não confirmado"],
    [<g key="f"><defs><pattern id="lg-h" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="#FF7A1A" strokeWidth="2" /></pattern></defs><rect x="1" y="3" width="34" height="12" rx="4" fill="url(#lg-h)" stroke="#FF7A1A" /></g>, "Hachurado — após o fim da vigência"],
    [<rect key="g" x="1" y="3" width="34" height="12" rx="4" fill="none" stroke="#fff" strokeOpacity="0.5" strokeDasharray="2 3" />, "Contorno fantasma — posição na base"],
    [<g key="h"><line x1="18" y1="0" x2="18" y2="18" stroke="#FF7A1A" strokeWidth="2" /></g>, "Linha laranja — fim de vigência"],
  ]
  return (
    <div className="mt-3 rounded-lg border p-3">
      <div className="mb-2 text-[11px] font-bold tracking-wider text-muted-foreground uppercase">Legenda</div>
      <ul className="space-y-1.5">
        {rows.map(([g, l], i) => (
          <li key={i} className="flex items-center gap-2 text-[11.5px]">
            <svg width="36" height="18" aria-hidden="true">{g}</svg>
            {l}
          </li>
        ))}
      </ul>
    </div>
  )
}

function Scenarios() {
  const doc = useStudio((s) => s.doc)
  const st = useStudio()
  return (
    <div className="space-y-2 p-2">
      <p className="px-1 text-[11.5px] leading-snug text-muted-foreground">
        A linha de base guarda os registros. Cenários guardam apenas diferenças — simulações nunca aparecem como aprovação.
      </p>
      {doc.scenarios.map((s) => {
        const n = Object.keys(s.overrides).length + s.added.length + s.removed.length
        const active = s.id === st.scenarioId
        return (
          <div key={s.id} className={cn("rounded-lg border p-2.5", active && "border-primary/70 bg-primary/8")}>
            <div className="flex items-start gap-2">
              <input type="radio" className="mt-1" checked={active} onChange={() => st.setScenario(s.id)} aria-label={`Ativar ${s.name}`} />
              <div className="min-w-0 flex-1">
                <input
                  className="w-full rounded bg-transparent text-[12.5px] font-semibold outline-none focus:bg-white/5"
                  value={s.name}
                  onChange={(e) => st.live((d) => ({ ...d, scenarios: d.scenarios.map((x) => (x.id === s.id ? { ...x, name: e.target.value } : x)) }))}
                />
                <div className="text-[11px] leading-snug text-muted-foreground">{s.description}</div>
                <div className="mt-1.5 flex flex-wrap items-center gap-1">
                  <Chip className={s.kind === "baseline" ? "text-foreground" : "border-[#C4B5FD]/50 text-[#C4B5FD]"}>
                    {s.kind === "baseline" ? "base documental" : s.kind === "working" ? "trabalho" : "alternativo"}
                  </Chip>
                  {s.kind !== "baseline" && <Chip>{n} {n === 1 ? "diferença" : "diferenças"}</Chip>}
                </div>
              </div>
            </div>
            <div className="mt-2 flex gap-1">
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
    </div>
  )
}
