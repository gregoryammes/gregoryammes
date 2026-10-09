import { useRef, useState } from "react"
import {
  CalendarRange, ChevronDown, Download, FileJson, Filter, GanttChart, Image as ImageIcon, Maximize2, Presentation,
  Lightbulb, Redo2, RotateCcw, Save, Timer, Undo2, Upload, Users, ZoomIn, ZoomOut,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { GROUPS } from "@/data/types"
import { cn } from "@/lib/utils"
import { useStudio } from "@/store/store"
import { useEffectiveItems } from "@/store/hooks"
import { RANGE_PRESETS, useView } from "@/store/view"
import { exportSvgString } from "./TimelineCanvas"
import { Modal } from "./Dialogs"
import { confirmAction } from "@/components/Confirm"

interface ExportOut {
  title: string
  filename: string
  text?: string
  imageUrl?: string
}

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

export function TopBar() {
  const doc = useStudio((s) => s.doc)
  const st = useStudio()
  const view = useView()
  const items = useEffectiveItems()
  const fileRef = useRef<HTMLInputElement>(null)
  const [menu, setMenu] = useState<"export" | "filter" | "range" | null>(null)
  const [out, setOut] = useState<ExportOut | null>(null)
  const [pasteOpen, setPasteOpen] = useState(false)
  const [custom, setCustom] = useState({ from: 2024, to: 2029 })
  const scenario = doc.scenarios.find((s) => s.id === st.scenarioId)
  const isBase = scenario?.kind === "baseline"

  const fitAll = () => {
    const vis = items.filter((i) => !i.hidden)
    if (vis.length) view.fit(Math.min(...vis.map((i) => i.range.start)), Math.max(...vis.map((i) => i.range.end)))
    view.set({ range: null })
  }
  const preset = RANGE_PRESETS.find((p) => view.range && p.from === view.range.from && p.to === view.range.to)
  const rangeLabel = preset ? preset.label : view.range ? `${view.range.from}–${view.range.to} · personalizado` : "Intervalo livre"

  return (
    <header className="relative z-30 flex h-[52px] shrink-0 items-center gap-3 border-b bg-white px-3">
      {/* Left: identity + active scenario */}
      <div className="flex shrink-0 items-center gap-2.5">
        <Logo />
        <div className="hidden leading-tight sm:block">
          <div className="text-[10px] font-semibold tracking-[0.16em] whitespace-nowrap text-muted-foreground">SKA TECH HUB</div>
          <div className="font-display text-[15px] font-bold whitespace-nowrap text-navy">Temporal Studio</div>
        </div>
        <label
          className={cn(
            "ml-1 flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-1",
            isBase ? "border-border bg-white" : "border-navy/40 bg-[#EEF2F8]",
          )}
          title="Cenário ativo — base documental ou simulação"
        >
          <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wider", isBase ? "bg-muted text-muted-foreground" : "bg-navy text-white")}>
            {isBase ? "BASE" : "CENÁRIO"}
          </span>
          <select aria-label="Cenário ativo" className="w-[150px] shrink-0 bg-transparent text-[12.5px] font-semibold text-foreground outline-none min-[1800px]:w-[230px]" value={st.scenarioId} onChange={(e) => st.setScenario(e.target.value)}>
            {doc.scenarios.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
      </div>

      {/* Center: range, zoom, filters, views */}
      <div className="mx-auto hidden items-center gap-1.5 lg:flex">
        <div className="relative">
          <Button size="sm" variant="outline" title={`Intervalo temporal exibido: ${rangeLabel}`} onClick={() => setMenu(menu === "range" ? null : "range")}>
            <CalendarRange className="size-3.5 text-muted-foreground" /> <span className="min-[1800px]:hidden">{view.range ? `${view.range.from}–${view.range.to}` : "Livre"}</span><span className="hidden max-w-[220px] truncate min-[1800px]:inline">{rangeLabel}</span> <ChevronDown className="size-3" />
          </Button>
          {menu === "range" && (
            <Menu onClose={() => setMenu(null)}>
              {RANGE_PRESETS.map((p) => (
                <MenuItem key={p.id} icon={CalendarRange} onClick={() => view.setRange(p.from, p.to)}>{p.label}</MenuItem>
              ))}
              <div className="my-1 border-t" />
              <div className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                <div className="mb-1.5 text-[11px] font-semibold text-muted-foreground">Intervalo personalizado</div>
                <div className="flex items-center gap-1.5">
                  <input aria-label="Ano inicial" type="number" className="field !w-20" value={custom.from} onChange={(e) => setCustom({ ...custom, from: +e.target.value })} />
                  <span className="text-xs text-muted-foreground">a</span>
                  <input aria-label="Ano final" type="number" className="field !w-20" value={custom.to} onChange={(e) => setCustom({ ...custom, to: +e.target.value })} />
                  <Button size="sm" variant="primary" onClick={() => { if (custom.to >= custom.from) { view.setRange(custom.from, custom.to); setMenu(null) } }}>Aplicar</Button>
                </div>
              </div>
            </Menu>
          )}
        </div>
        <div className="flex items-center rounded-md border">
          <Button size="icon" variant="ghost" className="!size-7 rounded-r-none" title="Reduzir zoom" onClick={() => { view.zoomAt(1 / 1.35); view.set({ range: null }) }}><ZoomOut className="size-3.5" /></Button>
          <Button size="sm" variant="ghost" className="rounded-none border-x" title="Ajustar ao conteúdo cadastrado" onClick={fitAll}><Maximize2 className="size-3.5" /> <span className="hidden min-[1800px]:inline">Ajustar</span></Button>
          <Button size="icon" variant="ghost" className="!size-7 rounded-l-none" title="Ampliar zoom" onClick={() => { view.zoomAt(1.35); view.set({ range: null }) }}><ZoomIn className="size-3.5" /></Button>
        </div>
        <div className="relative">
          <Button size="sm" variant="outline" active={view.projectFilter.length > 0 || view.detailAll} onClick={() => setMenu(menu === "filter" ? null : "filter")}>
            <Filter className="size-3.5" /> Filtros
          </Button>
          {menu === "filter" && (
            <Menu onClose={() => setMenu(null)}>
              <div className="px-3 pt-2 pb-1 text-[11px] font-semibold text-muted-foreground">Nível de detalhe</div>
              <div className="flex gap-1 px-3 pb-2" onClick={(e) => e.stopPropagation()}>
                <Button size="sm" variant="outline" active={!view.detailAll} onClick={() => view.set({ detailAll: false })}>Visão limpa</Button>
                <Button size="sm" variant="outline" active={view.detailAll} onClick={() => view.set({ detailAll: true })}>Detalhada</Button>
              </div>
              <div className="border-t px-3 pt-2 pb-1 text-[11px] font-semibold text-muted-foreground">Destacar projetos</div>
              {doc.projects.map((p) => {
                const on = view.projectFilter.includes(p.id)
                return (
                  <label key={p.id} className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={on} onChange={() => view.set({ projectFilter: on ? view.projectFilter.filter((x) => x !== p.id) : [...view.projectFilter, p.id] })} />
                    <span className="size-2.5 rounded-full" style={{ background: p.color }} /> {p.name} — {p.phase}
                  </label>
                )
              })}
              <div className="border-t px-3 pt-2 pb-1 text-[11px] font-semibold text-muted-foreground">Grupos visíveis</div>
              {GROUPS.map((g) => {
                const hidden = (doc.settings.groupsHidden ?? []).includes(g.id)
                return (
                  <label key={g.id} className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={!hidden} onChange={() => st.commit("visibilidade de grupo", (d) => {
                      const cur = d.settings.groupsHidden ?? []
                      return { ...d, settings: { ...d.settings, groupsHidden: hidden ? cur.filter((x) => x !== g.id) : [...cur, g.id] } }
                    })} />
                    {g.code} · {g.label}
                  </label>
                )
              })}
              <div className="border-t px-3 pt-2 pb-1 text-[11px] font-semibold text-muted-foreground">Sobreposições</div>
              <label className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted" onClick={(e) => e.stopPropagation()}>
                <input type="checkbox" checked={view.showLinks} onChange={() => view.set({ showLinks: !view.showLinks })} /> Todas as conexões (padrão: só do item selecionado)
              </label>
              <label className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted" onClick={(e) => e.stopPropagation()}>
                <input type="checkbox" checked={view.showAnnotations} onChange={() => view.set({ showAnnotations: !view.showAnnotations })} /> Anotações
              </label>
              <label className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted" onClick={(e) => e.stopPropagation()}>
                Comparar com
                <select aria-label="Comparar com" className="field !w-auto !py-0.5" value={st.compareId ?? ""} onChange={(e) => st.setCompare(e.target.value || null)}>
                  <option value="">—</option>
                  {doc.scenarios.filter((s) => s.id !== st.scenarioId).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>
              <button className="w-full px-3 py-1.5 text-left text-xs text-primary hover:bg-muted" onClick={() => view.set({ projectFilter: [], detailAll: false })}>Limpar filtros</button>
            </Menu>
          )}
        </div>
        <div role="tablist" aria-label="Visualização" className="ml-1 flex rounded-md border bg-muted p-0.5">
          {([
            ["timeline", "Linha do tempo", GanttChart],
            ["twotimes", "Dois Tempos", Timer],
            ["journey", "Jornada", Users],
            ["projeto3", "Projeto 3", Lightbulb],
          ] as const).map(([id, label, Icon]) => (
            <button
              key={id}
              role="tab"
              aria-selected={view.studioView === id}
              className={cn("flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-semibold whitespace-nowrap", view.studioView === id ? "bg-white text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
              onClick={() => view.set({ studioView: id })}
            >
              <Icon className="size-3.5" /> {label}
            </button>
          ))}
        </div>
      </div>

      {/* Right: save, history, export, present */}
      <div className="ml-auto flex items-center gap-1.5 lg:ml-0">
        <Button size="sm" variant="ghost" title="Salvar neste navegador (Ctrl+S)" onClick={st.save}>
          <Save className="size-3.5" /> <span className="hidden xl:inline">Salvar</span>
        </Button>
        <Button size="icon" variant="ghost" className="!size-7" title="Desfazer (Ctrl+Z)" aria-label="Desfazer" disabled={!st.past.length} onClick={st.undo}><Undo2 className="size-3.5" /></Button>
        <Button size="icon" variant="ghost" className="!size-7" title="Refazer (Ctrl+Shift+Z)" aria-label="Refazer" disabled={!st.future.length} onClick={st.redo}><Redo2 className="size-3.5" /></Button>
        <div className="relative">
          <Button size="sm" variant="outline" onClick={() => setMenu(menu === "export" ? null : "export")}>
            <Download className="size-3.5" /> <span className="hidden xl:inline">Exportar</span> <ChevronDown className="size-3" />
          </Button>
          {menu === "export" && (
            <Menu onClose={() => setMenu(null)} right>
              <MenuItem
                icon={FileJson}
                onClick={() => {
                  const filename = `ska-temporal-studio-${new Date().toISOString().slice(0, 10)}.json`
                  const text = st.exportJSON()
                  download(filename, text)
                  setOut({ title: "Backup JSON", filename, text })
                }}
              >
                Exportar JSON (backup completo)
              </MenuItem>
              <MenuItem icon={Upload} onClick={() => fileRef.current?.click()}>Importar arquivo JSON…</MenuItem>
              <MenuItem icon={Upload} onClick={() => setPasteOpen(true)}>Importar colando JSON…</MenuItem>
              <div className="my-1 border-t" />
              <MenuItem
                icon={ImageIcon}
                onClick={() => {
                  const s = exportSvgString()
                  if (s) {
                    download("timeline.svg", s, "image/svg+xml")
                    setOut({ title: "Timeline (SVG)", filename: "timeline.svg", text: s, imageUrl: URL.createObjectURL(new Blob([s], { type: "image/svg+xml" })) })
                  }
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
                    if (png) {
                      download("timeline.png", png)
                      setOut({ title: "Timeline (PNG)", filename: "timeline.png", imageUrl: URL.createObjectURL(png) })
                    }
                    st.log({ label: "exportar PNG", kind: "io", status: "ok" })
                  } catch {
                    st.toast("Não foi possível gerar o PNG neste navegador. Use o SVG.", "warn")
                    st.log({ label: "exportar PNG", kind: "io", status: "error" })
                  }
                }}
              >
                Exportar timeline (PNG)
              </MenuItem>
              <div className="px-3 py-1.5 text-[10.5px] leading-snug text-muted-foreground">Exportação em PDF e PowerPoint não implementada.</div>
              <div className="my-1 border-t" />
              <MenuItem icon={RotateCcw} onClick={async () => (await confirmAction("Restaurar os dados iniciais? (é possível desfazer)")) && st.resetToSeed()}>Restaurar dados iniciais</MenuItem>
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
        <Button variant="primary" size="md" onClick={() => st.setMode("board")}>
          <Presentation className="size-4" /> Apresentar
        </Button>
      </div>
      {out && <ExportDialog out={out} onClose={() => setOut(null)} />}
      {pasteOpen && <PasteImport onClose={() => setPasteOpen(false)} />}
    </header>
  )
}

function Menu({ children, onClose, right }: { children: React.ReactNode; onClose: () => void; right?: boolean }) {
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className={cn("absolute top-9 z-50 min-w-[270px] rounded-lg border bg-white py-1 shadow-xl shadow-slate-900/10", right ? "right-0" : "left-0")}
        onClick={(e) => {
          e.stopPropagation()
          if ((e.target as HTMLElement).closest("button")) onClose()
        }}
      >
        {children}
      </div>
    </>
  )
}

function MenuItem({ icon: Icon, children, onClick }: { icon: typeof Save; children: React.ReactNode; onClick: () => void }) {
  return (
    <button className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-foreground hover:bg-muted" onClick={onClick}>
      <Icon className="size-3.5 text-muted-foreground" /> {children}
    </button>
  )
}

export function Logo({ size = 30 }: { size?: number }) {
  // Placeholder mark (no official SKA asset in this session): stacked periods + the vigência marker.
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="7" fill="#173B63" />
      <rect x="6" y="9" width="12" height="3.4" rx="1" fill="#23845D" />
      <rect x="10" y="14.3" width="14" height="3.4" rx="1" fill="#2FA2DB" />
      <rect x="15" y="19.6" width="11" height="3.4" rx="1" fill="#FFFFFF" fillOpacity="0.7" />
      <rect x="21" y="6" width="1.8" height="20" fill="#E35D5D" />
    </svg>
  )
}

/** Shows the exported content in the page too: downloads are blocked in some sandboxed viewers. */
function ExportDialog({ out, onClose }: { out: ExportOut; onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  const ref = useRef<HTMLTextAreaElement>(null)
  return (
    <Modal title={out.title} onClose={onClose} width={560}>
      <p className="text-[12px] leading-snug text-muted-foreground">
        O download de <span className="font-mono text-foreground">{out.filename}</span> foi iniciado. Se o navegador bloquear downloads aqui,
        {out.text ? " copie o conteúdo abaixo e salve-o em um arquivo." : " clique com o botão direito na imagem e salve-a."}
      </p>
      {out.imageUrl && <img src={out.imageUrl} alt="Pré-visualização da timeline exportada" className="max-h-[220px] w-full rounded border object-contain" />}
      {out.text && <textarea ref={ref} readOnly className="field h-[180px] font-mono !text-[11px]" value={out.text.length > 200_000 ? out.text.slice(0, 200_000) + "\n…" : out.text} />}
      <div className="flex justify-end gap-2">
        {out.text && (
          <Button
            onClick={() => {
              navigator.clipboard.writeText(out.text!).then(
                () => setCopied(true),
                () => {
                  ref.current?.select()
                  setCopied(false)
                },
              )
            }}
          >
            {copied ? "Copiado" : "Copiar conteúdo"}
          </Button>
        )}
        <Button variant="primary" onClick={onClose}>Fechar</Button>
      </div>
    </Modal>
  )
}

function PasteImport({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState("")
  const importJSON = useStudio((s) => s.importJSON)
  return (
    <Modal title="Importar colando JSON" onClose={onClose} width={560}>
      <p className="text-[12px] text-muted-foreground">Cole aqui um backup exportado pelo Temporal Studio. A importação pode ser desfeita.</p>
      <textarea id="paste-import" className="field h-[200px] font-mono !text-[11px]" value={text} onChange={(e) => setText(e.target.value)} placeholder='{"schema": "ska-temporal-studio/1", …}' />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button variant="primary" disabled={!text.trim()} onClick={() => importJSON(text) && onClose()}>Importar</Button>
      </div>
    </Modal>
  )
}
