import { useEffect, useRef } from "react"
import { CalendarRange, ChevronsUpDown, Copy, EyeOff, Lock, PencilLine, Trash2, Unlock } from "lucide-react"
import type { EffItem } from "@/lib/analysis"
import { shortNameOf } from "@/lib/v6"
import { confirmAction } from "@/components/Confirm"
import { useStudio } from "@/store/store"
import { useView } from "@/store/view"

/** Double click on a block: edit its short label in place. Enter saves, Esc cancels. */
export function InlineLabel({ item, x, y, w, h, onClose }: { item: EffItem; x: number; y: number; w: number; h: number; onClose: () => void }) {
  const ref = useRef<HTMLInputElement>(null)
  const done = useRef(false)
  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])
  const commit = () => {
    if (done.current) return
    done.current = true
    const v = ref.current?.value.trim() ?? ""
    const cur = item.shortName ?? shortNameOf(item)
    if (v && v !== cur) useStudio.getState().patchItem(item.id, { shortName: v }, "rótulo")
    onClose()
  }
  return (
    <input
      ref={ref}
      aria-label="Rótulo curto do bloco"
      defaultValue={item.shortName ?? shortNameOf(item)}
      className="absolute z-30 rounded-md border-2 border-primary bg-white px-2 text-[12.5px] font-semibold text-foreground shadow-lg outline-none"
      style={{ left: x, top: y, width: w, height: h }}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === "Enter") commit()
        else if (e.key === "Escape") {
          done.current = true
          onClose()
        }
      }}
      onBlur={commit}
    />
  )
}

/** Right-click menu of a block. Destructive actions ask first; everything can be undone. */
export function BlockMenu({ item, x, y, w, onClose, onRename, toggleKey }: { item: EffItem; x: number; y: number; w: number; onClose: () => void; onRename: () => void; toggleKey?: string }) {
  const st = useStudio()
  const expanded = useView((s) => (toggleKey ? s.expanded.includes(toggleKey) : false))
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose()
    window.addEventListener("keydown", k)
    return () => window.removeEventListener("keydown", k)
  }, [onClose])
  const act = (fn: () => void) => () => {
    fn()
    onClose()
  }
  const Item = ({ icon: Icon, label, onClick, danger }: { icon: typeof Copy; label: string; onClick: () => void; danger?: boolean }) => (
    <button role="menuitem" className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-muted ${danger ? "text-destructive" : "text-foreground"}`} onClick={onClick}>
      <Icon className="size-3.5 opacity-70" /> {label}
    </button>
  )
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose() }} />
      <div role="menu" aria-label={`Ações de ${item.name}`} className="absolute z-50 w-[220px] rounded-lg border bg-white py-1 shadow-xl shadow-slate-900/15" style={{ left: Math.min(x, w - 230), top: y }}>
        <div className="truncate border-b px-3 pt-1 pb-1.5 text-[11px] font-semibold text-muted-foreground">{item.shortName ?? item.name}</div>
        <Item icon={PencilLine} label="Editar rótulo" onClick={act(onRename)} />
        <Item icon={CalendarRange} label="Editar datas…" onClick={act(() => st.setEditing(item.id))} />
        {toggleKey && <Item icon={ChevronsUpDown} label={expanded ? "Recolher componentes" : "Expandir componentes"} onClick={act(() => useView.getState().toggleAction(toggleKey))} />}
        <Item icon={Copy} label="Duplicar" onClick={act(() => st.duplicateItems([item.id]))} />
        <Item icon={EyeOff} label="Ocultar da timeline" onClick={act(() => st.patchItem(item.id, { hidden: true }, "ocultar"))} />
        <Item
          icon={item.locked ? Unlock : Lock}
          label={item.locked ? "Desbloquear" : "Bloquear edição"}
          onClick={act(() => st.commit(item.locked ? "desbloquear" : "bloquear", (d) => ({ ...d, items: d.items.map((x) => (x.id === item.id ? { ...x, locked: !item.locked } : x)) })))}
        />
        <div className="my-1 border-t" />
        <Item icon={Trash2} label="Excluir…" danger onClick={act(async () => (await confirmAction(`Excluir “${item.name}”? (é possível desfazer)`)) && st.deleteItems([item.id]))} />
      </div>
    </>
  )
}
