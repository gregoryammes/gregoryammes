import { useState } from "react"
import type { ItemKind } from "@/data/types"
import { BottomBar } from "./BottomBar"
import { CreateDialog, EditDatesDialog } from "./Dialogs"
import { LeftSidebar } from "./LeftSidebar"
import { PropertiesPanel } from "./PropertiesPanel"
import { TimelineCanvas } from "./TimelineCanvas"
import { TopBar } from "./TopBar"

export function Studio() {
  const [creating, setCreating] = useState<ItemKind | null>(null)
  return (
    <div className="flex h-full flex-col">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <LeftSidebar onCreate={setCreating} />
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-1">
            <TimelineCanvas />
          </div>
          <BottomBar />
        </main>
        <PropertiesPanel />
      </div>
      <EditDatesDialog />
      {creating && <CreateDialog kind={creating} onClose={() => setCreating(null)} />}
    </div>
  )
}
