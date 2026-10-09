import { RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { EffItem } from "@/lib/analysis"
import { barStyleFor, itemColor, statusOf } from "@/lib/visual"
import { toDay } from "@/lib/dates"
import type { BlockStyle } from "@/data/types"
import { useStudio } from "@/store/store"
import { V6Section } from "./PropertiesV6"

/** Predefined looks. They only change appearance. */
const PRESETS: { id: string; label: string; style: (c: string) => BlockStyle }[] = [
  { id: "padrao", label: "Padrão", style: () => ({}) },
  { id: "destaque", label: "Destaque", style: (c) => ({ fill: c, textColor: "#FFFFFF", weight: 800, radius: 8, strokeWidth: 0 }) },
  { id: "suave", label: "Suave", style: (c) => ({ fill: `${c}26`, textColor: "#18324A", stroke: c, strokeWidth: 1, radius: 6 }) },
  { id: "contorno", label: "Contorno", style: (c) => ({ fill: "#FFFFFF", textColor: c, stroke: c, strokeWidth: 2, radius: 4 }) },
  { id: "executivo", label: "Executivo", style: () => ({ fill: "#173B63", textColor: "#FFFFFF", font: "display", weight: 700, radius: 12, strokeWidth: 0 }) },
]

const Lbl = ({ children }: { children: React.ReactNode }) => <span className="mb-1 block text-[11.5px] font-medium text-muted-foreground">{children}</span>

/**
 * Design tab: font, size, weight, colours, outline, radius, opacity. Written to `item.style`, a
 * composition field — dates, status, values and links are never touched.
 */
export function DesignSection({ it }: { it: EffItem }) {
  const st = useStudio()
  const doc = useStudio((s) => s.doc)
  const base = itemColor(it.kind, doc.projects.find((p) => p.id === it.projectId)?.color ?? "#7C8DA6", it.color)
  const bs = barStyleFor(statusOf(it, toDay(doc.settings.referenceDate)).key, base)
  const sty = it.style ?? {}
  const set = (p: Partial<BlockStyle>, label = "design") => st.patchItem(it.id, { style: { ...sty, ...p, preset: p.preset ?? undefined } }, label)
  const live = (p: Partial<BlockStyle>) => st.livePatchItems({ [it.id]: { style: { ...(useStudio.getState().doc.items.find((x) => x.id === it.id)?.style ?? sty), ...p } } })
  const color = (key: "fill" | "stroke" | "textColor", label: string, fallback: string) => (
    <label className="block">
      <Lbl>{label}</Lbl>
      <div className="flex items-center gap-1.5">
        <input type="color" aria-label={label} className="h-8 w-10 cursor-pointer rounded border bg-white" value={(sty[key] ?? fallback).slice(0, 7)}
          onFocus={() => st.begin(label.toLowerCase())} onBlur={() => st.end()} onChange={(e) => live({ [key]: e.target.value })} />
        {sty[key] && <button className="text-[11px] text-primary" onClick={() => set({ [key]: undefined })}>padrão</button>}
      </div>
    </label>
  )
  return (
    <>
      <V6Section title="Estilos predefinidos">
        <div className="grid grid-cols-3 gap-1.5">
          {PRESETS.map((p) => {
            const s2 = p.style(base)
            return (
              <button key={p.id} aria-label={`Estilo ${p.label}`} onClick={() => st.patchItem(it.id, { style: p.id === "padrao" ? undefined : { ...s2, preset: p.id } }, `estilo ${p.label.toLowerCase()}`)}
                className={`rounded-md border px-1.5 py-1.5 text-[11px] ${sty.preset === p.id || (!it.style && p.id === "padrao") ? "border-primary ring-1 ring-primary" : ""}`}>
                <span className="mb-1 block h-4 rounded" style={{ background: s2.fill ?? bs.fill, border: `${s2.strokeWidth ?? 0}px solid ${s2.stroke ?? "transparent"}`, borderRadius: s2.radius ?? 3 }} />
                {p.label}
              </button>
            )
          })}
        </div>
      </V6Section>
      <V6Section title="Texto">
        <div className="grid grid-cols-2 gap-2">
          <label className="block"><Lbl>Fonte</Lbl>
            <select aria-label="Fonte" className="field" value={sty.font ?? "inter"} onChange={(e) => set({ font: e.target.value as BlockStyle["font"] })}>
              <option value="inter">Inter</option>
              <option value="display">Inter Tight</option>
              <option value="mono">Mono</option>
              <option value="serif">Serifada</option>
            </select>
          </label>
          <label className="block"><Lbl>Tamanho</Lbl>
            <select aria-label="Tamanho da fonte" className="field" value={sty.size ?? 11.5} onChange={(e) => set({ size: +e.target.value })}>
              {[10, 10.5, 11.5, 12.5, 13.5, 15].map((n) => <option key={n} value={n}>{n}px</option>)}
            </select>
          </label>
          <label className="block"><Lbl>Peso</Lbl>
            <select aria-label="Peso da fonte" className="field" value={sty.weight ?? 600} onChange={(e) => set({ weight: +e.target.value })}>
              {[400, 500, 600, 700, 800].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          {color("textColor", "Cor do texto", bs.text)}
        </div>
      </V6Section>
      <V6Section title="Bloco">
        <div className="grid grid-cols-2 gap-2">
          {color("fill", "Preenchimento", bs.fill.startsWith("#") ? bs.fill : base)}
          {color("stroke", "Contorno", bs.stroke.startsWith("#") ? bs.stroke : base)}
          <label className="block"><Lbl>Espessura do contorno</Lbl>
            <input aria-label="Espessura do contorno" type="range" min={0} max={4} step={0.5} className="w-full" value={sty.strokeWidth ?? bs.strokeWidth}
              onPointerDown={() => st.begin("contorno")} onPointerUp={() => st.end()} onChange={(e) => live({ strokeWidth: +e.target.value })} />
          </label>
          <label className="block"><Lbl>Arredondamento</Lbl>
            <input aria-label="Arredondamento" type="range" min={0} max={14} step={1} className="w-full" value={sty.radius ?? 3}
              onPointerDown={() => st.begin("arredondamento")} onPointerUp={() => st.end()} onChange={(e) => live({ radius: +e.target.value })} />
          </label>
          <label className="col-span-2 block"><Lbl>Opacidade · {Math.round((sty.opacity ?? 1) * 100)}%</Lbl>
            <input aria-label="Opacidade" type="range" min={0.3} max={1} step={0.05} className="w-full" value={sty.opacity ?? 1}
              onPointerDown={() => st.begin("opacidade")} onPointerUp={() => st.end()} onChange={(e) => live({ opacity: +e.target.value })} />
          </label>
        </div>
        <p className="text-[11px] leading-snug text-muted-foreground">A aparência não altera datas, situação, valores nem vínculos. A forma da barra (cheia, contorno, tracejada) continua indicando a situação.</p>
        {it.style && (
          <Button size="sm" variant="ghost" onClick={() => st.patchItem(it.id, { style: undefined }, "restaurar aparência")}>
            <RotateCcw className="size-3" /> Restaurar aparência padrão
          </Button>
        )}
      </V6Section>
    </>
  )
}
