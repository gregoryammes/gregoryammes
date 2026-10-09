import { useEffect } from "react"
import { create } from "zustand"
import { Button } from "@/components/ui/button"

/**
 * In-page confirmation. Sandboxed viewers (Claude Artifacts) silently refuse `window.confirm`,
 * so destructive actions confirm here instead.
 */
interface ConfirmState {
  text: string | null
  resolve: ((ok: boolean) => void) | null
  ask: (text: string) => Promise<boolean>
}

const useConfirm = create<ConfirmState>((set) => ({
  text: null,
  resolve: null,
  ask: (text) => new Promise<boolean>((resolve) => set({ text, resolve })),
}))

export const confirmAction = (text: string) => useConfirm.getState().ask(text)

export function ConfirmHost() {
  const { text, resolve } = useConfirm()
  const close = (ok: boolean) => {
    resolve?.(ok)
    useConfirm.setState({ text: null, resolve: null })
  }
  useEffect(() => {
    if (!text) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(false)
      if (e.key === "Enter") close(true)
      e.stopImmediatePropagation()
    }
    window.addEventListener("keydown", onKey, { capture: true })
    return () => window.removeEventListener("keydown", onKey, { capture: true })
  })
  if (!text) return null
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/55 p-4" onMouseDown={() => close(false)}>
      <div role="alertdialog" aria-modal="true" aria-label="Confirmar" className="w-[380px] max-w-full rounded-xl border bg-panel-2 p-4 shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <p className="text-[13px] leading-snug">{text}</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => close(false)}>Cancelar</Button>
          <Button variant="danger" autoFocus onClick={() => close(true)}>Confirmar</Button>
        </div>
      </div>
    </div>
  )
}
