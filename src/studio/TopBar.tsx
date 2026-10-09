import { useRef, useState } from "react"
import {
  ChevronDown, Download, FileJson, Filter, Hand, Image as ImageIcon, Link2, Maximize2, MousePointer2, Presentation,
  Redo2, RotateCcw, Save, StickyNote, Undo2, Upload, ZoomIn, ZoomOut,
} from "lucide-react"
import { Button, Divider } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useStudio } from "@/store/store"
import { useEffectiveItems } from "@/store/hooks"
import { useView, ZOOM_PRESETS, type Tool } from "@/store/view"
import { exportSvgString } from "./TimelineCanvas"

function download(name: string, data: string | Blob, type = "application/json") {
  const blob = typeof data === "string" ? new Blob([data], { type }) : data
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

async function svgToPng(svg: string, w: number, h: number): Promise<Blob | null> {
  const img = new Image()
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }))
  await new Promise<void>((res, rej) => {
    img.onload = () => res()
    img.onerror = () => rej(new Error("svg"))
    img.src = url
  })
  const c = document.createElement("canvas")
  c.width = w * 2
  c.height = h * 2
  const ctx = c.getContext("2d")!
  ctx.scale(2, 2)
  ctx.drawImage(img, 0, 0)
  URL.revokeObjectURL(url)
  return new Promise((res) => c.toBlob((b) => res(b), "image/png"))
}

const TOOLS: { id: Tool; icon: typeof Hand; label: string; key: string }[] = [
  { id: "select", icon: MousePointer2, label: "Selecionar", key: "V" },
  { id: "hand", icon: Hand, label: "Mover tela", key: "H" },
  { id: "note", icon: StickyNote, label: "Anotação", key: "N" },
  { id: "connect", icon: Link2, label: "Conectar", key: "C" },
]

export function TopBar() {
  const doc = useStudio((s) => s.doc)
  const st = useStudio()
  const view = useView()
  const items = useEffectiveItems()
  const fileRef = useRef<HTMLInputElement>(null)
  const [menu, setMenu] = useState<"export" | "filter" | null>(null)
  const scenarioKind = doc.scenarios.find((s) => s.id === st.scenarioId)?.kind

  const fitAll = () => {
    const vis = items.filter((i) => !i.hidden)
    if (vis.length) view.fit(Math.min(...vis.map((i) => i.range.start)), Math.max(...vis.map((i) => i.range.end)))
  }
  const preset = Object.entries(ZOOM_PRESETS).reduce((best, [k, v]) =>
    Math.abs(Math.log(v.pxPerDay / view.pxPerDay)) < Math.abs(Math.log(ZOOM_PRESETS[best as keyof typeof ZOOM_PRESETS].pxPerDay / view.pxPerDay)) ? k : best, "anual")

  return (
    <header className="relative z-30 flex h-12 shrink-0 items-center gap-1 border-b bg-panel px-2">
      <div className="flex items-center gap-2 pr-2 pl-1">
        <Logo />
        <div className="leading-tight">
          <div className="text-[10px] font-semibold tracking-[0.18em] whitespace-nowrap text-muted-foreground">SKA TECH HUB · TEMPORAL STUDIO</div>
          <input
            aria-label="Nome do planejamento"
            className="w-[190px] rounded bg-transparent text-[13px] font-semibold outline-none focus:bg-white/5"
            value={doc.meta.name}
            onChange={(e) => st.live((d) => ({ ...d, meta: { ...d.meta, name: e.target.value } }))}
          />
        </div>
      </div>
      <Divider />
      <Button size="icon" variant="ghost" title="Salvar (Ctrl+S)" onClick={st.save}>
        <Save className="size-4" />
      </Button>
      <Button size="icon" variant="ghost" title="Desfazer (Ctrl+Z)" disabled={!st.past.length} onClick={st.undo}>
        <Undo2 className="size-4" />
      </Button>
      <Button size="icon" variant="ghost" title="Refazer (Ctrl+Shift+Z)" disabled={!st.future.length} onClick={st.redo}>
        <Redo2 className="size-4" />
      </Button>
      <Divider />
      {TOOLS.map((t) => (
        <Button key={t.id} size="icon" variant="ghost" active={view.tool === t.id} title={`${t.label} (${t.key})`} onClick={() => view.set({ tool: t.id, connectFrom: null })}>
          <t.icon className="size-4" />
        </Button>
      ))}
      <Divider />
      <Button size="icon" variant="ghost" title="Reduzir zoom" onClick={() => view.zoomAt(1 / 1.35)}>
        <ZoomOut className="size-4" />
      </Button>
      <select
        aria-label="Escala temporal"
        className="field !w-[108px] !py-1"
        value={preset}
        onChange={(e) => view.setZoom(ZOOM_PRESETS[e.target.value as keyof typeof ZOOM_PRESETS].pxPerDay)}
      >
        {Object.entries(ZOOM_PRESETS).map(([k, v]) => (
          <option key={k} value={k}>{v.label}</option>
        ))}
      </select>
      <Button size="icon" variant="ghost" title="Ampliar zoom" onClick={() => view.zoomAt(1.35)}>
        <ZoomIn className="size-4" />
      </Button>
      <Button size="sm" variant="ghost" title="Ajustar ao conteúdo (F)" onClick={fitAll}>
        <Maximize2 className="size-3.5" /> <span className="hidden 2xl:inline">Ajustar</span>
      </Button>
      <label className="ml-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <span className="hidden 2xl:inline">Encaixe</span>
        <select title="Encaixe automático"
          className="field !w-[96px] !py-1"
          value={doc.settings.snap}
          onChange={(e) => st.commit("encaixe", (d) => ({ ...d, settings: { ...d.settings, snap: e.target.value as typeof d.settings.snap } }))}
        >
          <option value="none">Livre</option>
          <option value="day">Dia</option>
          <option value="week">Semana</option>
          <option value="month">Mês</option>
          <option value="quarter">Trimestre</option>
        </select>
      </label>
      <div className="relative">
        <Button size="sm" variant="ghost" active={view.projectFilter.length > 0} onClick={() => setMenu(menu === "filter" ? null : "filter")}>
          <Filter className="size-3.5" /> <span className="hidden 2xl:inline">Filtros</span>
        </Button>
        {menu === "filter" && (
          <Menu onClose={() => setMenu(null)}>
            <div className="px-3 pt-2 pb-1 text-[11px] font-semibold text-muted-foreground">Destacar projetos</div>
            {doc.projects.map((p) => {
              const on = view.projectFilter.includes(p.id)
              return (
                <label key={p.id} className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-xs hover:bg-white/5">
                  <input type="checkbox" checked={on} onChange={() => view.set({ projectFilter: on ? view.projectFilter.filter((x) => x !== p.id) : [...view.projectFilter, p.id] })} />
                  <span className="size-2.5 rounded-full" style={{ background: p.color }} /> {p.name} — {p.phase}
                </label>
              )
            })}
            <div className="my-1 border-t" />
            <label className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-xs hover:bg-white/5">
              <input type="checkbox" checked={view.showLinks} onChange={() => view.set({ showLinks: !view.showLinks })} /> Mostrar conexões
            </label>
            <label className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-xs hover:bg-white/5">
              <input type="checkbox" checked={view.showAnnotations} onChange={() => view.set({ showAnnotations: !view.showAnnotations })} /> Mostrar anotações
            </label>
            <button className="w-full px-3 py-1.5 text-left text-xs text-primary hover:bg-white/5" onClick={() => view.set({ projectFilter: [] })}>Limpar filtros</button>
          </Menu>
        )}
      </div>

      <div className="ml-auto flex items-center gap-1.5">
        <div className={cn("flex items-center gap-1.5 rounded-md border px-1.5 py-1", scenarioKind === "baseline" ? "border-border" : "border-[#C4B5FD]/60 bg-[#C4B5FD]/10")}>
          <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wider", scenarioKind === "baseline" ? "bg-white/10 text-foreground" : "bg-[#C4B5FD] text-[#1b1240]")}>
            {scenarioKind === "baseline" ? "BASE" : "HIPÓTESE"}
          </span>
          <select aria-label="Cenário ativo" className="max-w-[190px] bg-transparent text-xs font-semibold outline-none" value={st.scenarioId} onChange={(e) => st.setScenario(e.target.value)}>
            {doc.scenarios.map((s) => (
              <option key={s.id} value={s.id} className="bg-panel">{s.name}</option>
            ))}
          </select>
          <span className="hidden text-[10px] text-muted-foreground 2xl:inline">comparar</span>
          <select aria-label="Comparar com" className="max-w-[96px] bg-transparent text-xs outline-none" title="Comparar com outro cenário" value={st.compareId ?? ""} onChange={(e) => st.setCompare(e.target.value || null)}>
            <option value="" className="bg-panel">—</option>
            {doc.scenarios.filter((s) => s.id !== st.scenarioId).map((s) => (
              <option key={s.id} value={s.id} className="bg-panel">{s.name}</option>
            ))}
          </select>
        </div>
        <div className="relative">
          <Button size="sm" variant="outline" onClick={() => setMenu(menu === "export" ? null : "export")}>
            <Download className="size-3.5" /> <span className="hidden xl:inline">Exportar</span> <ChevronDown className="size-3" />
          </Button>
          {menu === "export" && (
            <Menu onClose={() => setMenu(null)} right>
              <MenuItem icon={FileJson} onClick={() => download(`ska-temporal-studio-${new Date().toISOString().slice(0, 10)}.json`, st.exportJSON())}>Exportar JSON (backup completo)</MenuItem>
              <MenuItem icon={Upload} onClick={() => fileRef.current?.click()}>Importar JSON…</MenuItem>
              <div className="my-1 border-t" />
              <MenuItem
                icon={ImageIcon}
                onClick={() => {
                  const s = exportSvgString()
                  if (s) download("timeline.svg", s, "image/svg+xml")
                  st.log({ label: "exportar SVG", kind: "io", status: s ? "ok" : "error" })
                }}
              >
                Exportar timeline (SVG)
              </MenuItem>
              <MenuItem
                icon={ImageIcon}
                onClick={async () => {
                  const s = exportSvgString()
                  const el = document.getElementById("timeline-svg")
                  if (!s || !el) return
                  try {
                    const png = await svgToPng(s, el.clientWidth, el.clientHeight)
                    if (png) download("timeline.png", png)
                    st.log({ label: "exportar PNG", kind: "io", status: "ok" })
                  } catch {
                    st.toast("Não foi possível gerar o PNG neste navegador. Use o SVG.", "warn")
                    st.log({ label: "exportar PNG", kind: "io", status: "error" })
                  }
                }}
              >
                Exportar timeline (PNG)
              </MenuItem>
              <div className="px-3 py-1.5 text-[10.5px] leading-snug text-muted-foreground">PDF: use “Imprimir → Salvar como PDF” do navegador no Modo Diretoria. Exportação para PowerPoint não implementada.</div>
              <div className="my-1 border-t" />
              <MenuItem icon={RotateCcw} onClick={() => window.confirm("Restaurar os dados iniciais? (é possível desfazer)") && st.resetToSeed()}>Restaurar dados iniciais</MenuItem>
            </Menu>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0]
              if (f) st.importJSON(await f.text())
              e.target.value = ""
              setMenu(null)
            }}
          />
        </div>
        <Button variant="accent" size="md" onClick={() => st.setMode("board")}>
          <Presentation className="size-4" /> Modo Diretoria
        </Button>
      </div>
    </header>
  )
}

function Menu({ children, onClose, right }: { children: React.ReactNode; onClose: () => void; right?: boolean }) {
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className={cn("absolute top-9 z-50 min-w-[260px] rounded-lg border bg-panel-2 py-1 shadow-2xl shadow-black/50", right ? "right-0" : "left-0")} onClick={(e) => {
          e.stopPropagation()
          if ((e.target as HTMLElement).closest("button")) onClose()
        }}>
        {children}
      </div>
    </>
  )
}

function MenuItem({ icon: Icon, children, onClick }: { icon: typeof Hand; children: React.ReactNode; onClick: () => void }) {
  return (
    <button className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-white/5" onClick={onClick}>
      <Icon className="size-3.5 text-muted-foreground" /> {children}
    </button>
  )
}

export function Logo({ size = 28 }: { size?: number }) {
  // Placeholder mark (no official SKA asset in this session): stacked temporal rails + continuity node.
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#1F4FD1" />
      <rect x="6" y="9" width="13" height="3.2" rx="1.6" fill="#ffffff" />
      <rect x="9" y="14.4" width="15" height="3.2" rx="1.6" fill="#2EA8FF" />
      <rect x="13" y="19.8" width="13" height="3.2" rx="1.6" fill="#ffffff" fillOpacity="0.55" />
      <circle cx="24" cy="10.6" r="2.6" fill="#FF7A1A" />
    </svg>
  )
}
