import { createContext, useContext, useRef } from "react"
import { Eye, EyeOff, Minus, Plus, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import type { BoxLayout, SceneNote } from "@/data/types"
import { useStudio } from "@/store/store"

export const STAGE_W = 1920
export const STAGE_H = 1080

/** Stage scale (screen px per stage px), so drags in design mode stay under the cursor. */
export const StageScale = createContext(1)

const SWATCHES = ["#E8EEFC", "#2EA8FF", "#FF7A1A", "#C4B5FD", "#FFD08A"]

/**
 * A piece of presentation composition. Its position lives in `presentation.layout`, never in the
 * temporal records — moving a caption cannot change a date.
 */
export function Movable({
  k,
  x,
  y,
  w,
  children,
  className,
  style,
}: {
  k: string
  x: number
  y: number
  w?: number
  children: React.ReactNode
  className?: string
  style?: React.CSSProperties
}) {
  const design = useStudio((s) => s.designMode)
  const box = useStudio((s) => s.doc.presentation.layout[k]) as BoxLayout | undefined
  const scale = useContext(StageScale)
  const drag = useRef<{ sx: number; sy: number; x: number; y: number; w: number; mode: "move" | "resize" } | null>(null)
  const st = useStudio.getState
  const bx = box?.x ?? x
  const by = box?.y ?? y
  const bw = box?.w ?? w
  const s = box?.scale ?? 1
  if (box?.hidden && !design) return null

  const down = (mode: "move" | "resize") => (e: React.PointerEvent) => {
    if (!design) return
    e.stopPropagation()
    e.preventDefault()
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    drag.current = { sx: e.clientX, sy: e.clientY, x: bx, y: by, w: bw ?? 400, mode }
    st().begin(mode === "move" ? "mover elemento da cena" : "redimensionar elemento")
  }
  const move = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const dx = (e.clientX - d.sx) / scale
    const dy = (e.clientY - d.sy) / scale
    if (d.mode === "move") st().setLayout(k, { x: Math.round(d.x + dx), y: Math.round(d.y + dy) }, true)
    else st().setLayout(k, { w: Math.max(120, Math.round(d.w + dx)) }, true)
  }
  const up = () => {
    if (drag.current) st().end()
    drag.current = null
  }

  return (
    <div
      className={cn("absolute", design && "group/mv cursor-move rounded-md outline-1 outline-dashed outline-[#2EA8FF]/0 hover:outline-[#2EA8FF]/70", box?.hidden && "opacity-30", className)}
      style={{ left: bx, top: by, width: bw, transform: s !== 1 ? `scale(${s})` : undefined, transformOrigin: "top left", color: box?.color, ...style }}
      onPointerDown={down("move")}
      onPointerMove={move}
      onPointerUp={up}
    >
      {children}
      {design && (
        <>
          <div
            className="absolute top-1/2 -right-2 h-8 w-3 -translate-y-1/2 cursor-ew-resize rounded bg-primary opacity-0 group-hover/mv:opacity-100"
            onPointerDown={down("resize")}
            onPointerMove={move}
            onPointerUp={up}
          />
          <div className="absolute -top-9 left-0 hidden items-center gap-1 rounded-md border bg-panel-2 px-1.5 py-1 text-foreground shadow-lg group-hover/mv:flex" onPointerDown={(e) => e.stopPropagation()}>
            <button title={box?.hidden ? "Mostrar" : "Ocultar na apresentação"} className="rounded p-1 hover:bg-white/10" onClick={() => st().setLayout(k, { hidden: !box?.hidden })}>
              {box?.hidden ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
            <button title="Reduzir" className="rounded p-1 hover:bg-white/10" onClick={() => st().setLayout(k, { scale: Math.max(0.5, +(s - 0.1).toFixed(2)) })}><Minus className="size-4" /></button>
            <button title="Ampliar" className="rounded p-1 hover:bg-white/10" onClick={() => st().setLayout(k, { scale: Math.min(2, +(s + 0.1).toFixed(2)) })}><Plus className="size-4" /></button>
            {SWATCHES.map((c) => (
              <button key={c} title="Cor do texto" className="size-4 rounded-full border border-white/30" style={{ background: c }} onClick={() => st().setLayout(k, { color: c })} />
            ))}
            <button title="Cor padrão" className="px-1 text-[11px] text-muted-foreground hover:text-foreground" onClick={() => st().setLayout(k, { color: undefined })}>auto</button>
          </div>
        </>
      )}
    </div>
  )
}

/** Free notes and arrows added in design mode. A note linked to a record follows that record. */
export function SceneNotes({ scene, resolveX }: { scene: number; resolveX?: (n: SceneNote) => number | null }) {
  const notes = useStudio((s) => s.doc.presentation.notes).filter((n) => n.scene === scene)
  const design = useStudio((s) => s.designMode)
  const scale = useContext(StageScale)
  const drag = useRef<{ id: string; sx: number; sy: number; x: number; y: number } | null>(null)
  const st = useStudio.getState
  return (
    <>
      {notes.map((n) => {
        const lx = resolveX?.(n)
        const x = lx ?? n.x
        return (
          <div
            key={n.id}
            className={cn("absolute z-20 max-w-[420px] rounded-xl border-2 bg-[#0E1D45]/95 px-5 py-3 text-[22px] leading-snug font-semibold shadow-2xl", design && "cursor-move")}
            style={{ left: x, top: n.y, borderColor: n.color ?? "#FFD08A", color: "#F4F7FF" }}
            onPointerDown={(e) => {
              if (!design) return
              if ((e.target as HTMLElement).isContentEditable) return
              ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
              drag.current = { id: n.id, sx: e.clientX, sy: e.clientY, x: n.x, y: n.y }
              st().begin("mover nota")
            }}
            onPointerMove={(e) => {
              const d = drag.current
              if (!d) return
              st().patchSceneNote(d.id, { x: Math.round(d.x + (e.clientX - d.sx) / scale), y: Math.round(d.y + (e.clientY - d.sy) / scale) }, true)
            }}
            onPointerUp={() => {
              if (drag.current) st().end()
              drag.current = null
            }}
          >
            {n.arrow && (
              <svg className="absolute -bottom-[54px] left-6" width="60" height="56" aria-hidden="true">
                <path d="M8,2 C10,30 26,44 50,50" stroke={n.color ?? "#FFD08A"} strokeWidth="3" fill="none" />
                <path d="M40,40 L52,51 L37,55" stroke={n.color ?? "#FFD08A"} strokeWidth="3" fill="none" />
              </svg>
            )}
            <span
              contentEditable={design}
              suppressContentEditableWarning
              className="outline-none"
              onBlur={(e) => {
                const text = e.currentTarget.textContent ?? ""
                if (text !== n.text) st().patchSceneNote(n.id, { text })
              }}
            >
              {n.text}
            </span>
            {design && (
              <div className="mt-2 flex items-center gap-2 text-[13px] font-normal text-muted-foreground" onPointerDown={(e) => e.stopPropagation()}>
                <label className="flex items-center gap-1"><input type="checkbox" checked={!!n.arrow} onChange={() => st().patchSceneNote(n.id, { arrow: !n.arrow })} /> seta</label>
                {SWATCHES.slice(1).map((c) => (
                  <button key={c} className="size-4 rounded-full" style={{ background: c }} onClick={() => st().patchSceneNote(n.id, { color: c })} />
                ))}
                {n.linkedItemId && <span className="text-primary">vinculada</span>}
                <button className="ml-auto hover:text-destructive" onClick={() => st().deleteSceneNote(n.id)}><Trash2 className="size-4" /></button>
              </div>
            )}
          </div>
        )
      })}
    </>
  )
}

export function SceneTitle({ scene, eyebrow, title, sub, size = 66 }: { scene: number; eyebrow: string; title: string; sub?: string; size?: number }) {
  return (
    <>
      <Movable k={`s${scene}:eyebrow`} x={120} y={84} w={1200}>
        <div className="flex items-center gap-3 text-[20px] font-semibold tracking-[0.22em] text-[#7FD1FF] uppercase">
          <span className="font-mono text-[18px] text-[#FF7A1A]">0{scene + 1}</span>
          {eyebrow}
        </div>
      </Movable>
      <Movable k={`s${scene}:title`} x={120} y={124} w={1680}>
        <h1 className="leading-[1.04] font-bold tracking-[-0.02em] text-white" style={{ fontSize: size }}>{title}</h1>
      </Movable>
      {sub && (
        <Movable k={`s${scene}:sub`} x={120} y={214} w={1180}>
          <p className="text-[25px] leading-snug text-[#AFC0E6]">{sub}</p>
        </Movable>
      )}
    </>
  )
}
