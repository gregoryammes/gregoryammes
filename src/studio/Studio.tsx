import { useState } from "react"
import type { ItemKind } from "@/data/types"
import { useView } from "@/store/view"
import { CanvasToolbar, IndicatorStrip } from "./BottomBar"
import { CreateDialog, EditDatesDialog } from "./Dialogs"
import { JourneyMatrix } from "./JourneyMatrix"
import { LeftSidebar } from "./LeftSidebar"
import { PropertiesPanel } from "./PropertiesPanel"
import { TimelineCanvas } from "./TimelineCanvas"
import { TopBar } from "./TopBar"

export function Studio() {
  const [creating, setCreating] = useState<ItemKind | null>(null)
  const studioView = useView((s) => s.studioView)
  return (
    <div className="flex h-full flex-col bg-background">
      <TopBar />
      <div className="relative flex min-h-0 flex-1">
        <LeftSidebar onCreate={setCreating} />
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="relative min-h-0 flex-1">
            {studioView === "timeline" ? (
              <>
                <TimelineCanvas />
                <CanvasToolbar />
              </>
            ) : (
              <JourneyMatrix />
            )}
          </div>
          <IndicatorStrip />
        </main>
        <PropertiesPanel />
      </div>
      <EditDatesDialog />
      {creating && <CreateDialog kind={creating} onClose={() => setCreating(null)} />}
    </div>
  )
}
