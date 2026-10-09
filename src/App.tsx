import { lazy, Suspense } from "react"
import { Toasts } from "@/components/Toasts"
import { Studio } from "@/studio/Studio"
import { useStudio } from "@/store/store"

const Board = lazy(() => import("@/board/Board"))

export default function App() {
  const mode = useStudio((s) => s.mode)
  return (
    <>
      {/* The Studio stays mounted under the Diretoria so returning keeps zoom, scroll and selection. */}
      <div className="h-full" style={{ display: mode === "studio" ? "block" : "none" }}>
        <Studio />
      </div>
      {mode === "board" && (
        <Suspense fallback={<div className="fixed inset-0 grid place-items-center bg-background text-sm text-muted-foreground">Preparando apresentação…</div>}>
          <Board />
        </Suspense>
      )}
      <Toasts />
    </>
  )
}
