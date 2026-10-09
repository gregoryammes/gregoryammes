import { X } from "lucide-react"
import { cn } from "@/lib/utils"
import { useStudio } from "@/store/store"

export function Toasts() {
  const toasts = useStudio((s) => s.toasts)
  const dismiss = useStudio((s) => s.dismissToast)
  return (
    <div aria-live="polite" className="pointer-events-none fixed right-4 bottom-24 z-[90] flex w-[380px] flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            "pointer-events-auto flex items-start gap-2 rounded-lg border bg-panel-2 px-3 py-2.5 text-[12.5px] leading-snug shadow-xl shadow-slate-900/10",
            t.tone === "warn" && "border-navy/40",
            t.tone === "ok" && "border-primary/50",
          )}
        >
          <span className={cn("mt-1 size-2 shrink-0 rounded-full", t.tone === "warn" ? "bg-navy" : t.tone === "ok" ? "bg-primary" : "bg-muted-foreground")} />
          <span className="flex-1">{t.text}</span>
          <button aria-label="Fechar" className="text-muted-foreground hover:text-foreground" onClick={() => dismiss(t.id)}><X className="size-3.5" /></button>
        </div>
      ))}
    </div>
  )
}
