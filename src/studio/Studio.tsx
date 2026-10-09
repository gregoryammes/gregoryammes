import { useEffect, useState } from "react"
import { useStudio } from "@/store/store"
import type { ItemKind } from "@/data/types"
import { useView } from "@/store/view"
import { CanvasToolbar, IndicatorStrip } from "./BottomBar"
import { CreateDialog, EditDatesDialog } from "./Dialogs"
import { JourneyView } from "./JourneyView"
import { LeftSidebar } from "./LeftSidebar"
import { PropertiesPanel } from "./PropertiesPanel"
import { TimelineCanvas } from "./TimelineCanvas"
import { TopBar } from "./TopBar"
import { TimelineControls } from "./TimelineControls"
import { TwoTimes } from "./TwoTimes"
import { Projeto3 } from "./Projeto3"
import { ContextSummary } from "./ContextSummary"

export function Studio() {
  const [creating, setCreating] = useState<ItemKind | null>(null)
  const studioView = useView((s) => s.studioView)
  // Undo / redo / save work in every Studio view (the timeline canvas has its own, richer handler).
  useEffect(() => {
    if (studioView === "timeline") return
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.closest("input,textarea,select,[contenteditable]") || useStudio.getState().mode !== "studio") return
      if (!(e.metaKey || e.ctrlKey)) return
      const k = e.key.toLowerCase()
      const st = useStudio.getState()
      if (k === "z") (e.shiftKey ? st.redo() : st.undo())
      else if (k === "y") st.redo()
      else if (k === "s") st.save()
      else return
      e.preventDefault()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [studioView])
  return (
    <div className="flex h-full flex-col bg-background">
      <TopBar />
      <div className="relative flex min-h-0 flex-1">
        <LeftSidebar onCreate={setCreating} />
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="relative min-h-0 flex-1">
            {studioView === "timeline" ? (
              <div className="flex h-full flex-col">
                <TimelineControls />
                <div className="relative min-h-0 flex-1">
                  <TimelineCanvas />
                  <CanvasToolbar />
                </div>
              </div>
            ) : studioView === "twotimes" ? (
              <TwoTimes />
            ) : studioView === "projeto3" ? (
              <Projeto3 />
            ) : (
              <JourneyView />
            )}
          </div>
          {studioView === "timeline" && <ContextSummary />}
          <IndicatorStrip />
        </main>
        <PropertiesPanel />
      </div>
      <EditDatesDialog />
      {creating && <CreateDialog kind={creating} onClose={() => setCreating(null)} />}
    </div>
  )
}
