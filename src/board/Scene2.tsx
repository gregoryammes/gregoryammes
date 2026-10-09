import { useState } from "react"
import { cn } from "@/lib/utils"
import { JourneyView } from "@/studio/JourneyView"
import { SceneCourses } from "./SceneCourses"
import { Movable, SceneNotes, SceneTitle } from "./Stage"

/**
 * Scene 2 — Jornada Educacional: Jornada → Robótica → Técnico from the same records. A second tab
 * opens the technical courses one by one (acquisition, bolsas, NF, materiais revealed in steps).
 */
export function Scene2() {
  const [tab, setTab] = useState<"jornada" | "cursos">("jornada")
  return (
    <div className="absolute inset-0">
      {tab === "jornada" ? (
        <>
          <SceneTitle scene={1} n={2} eyebrow="Jornada educacional" title="Jornada → Robótica → Técnico: a formação atravessa os projetos" size={52} />
          <div className="absolute top-[232px] left-[120px] h-[720px] w-[1680px]">
            <JourneyView size="stage" />
          </div>
          <Movable k="s1:disclaimer" x={120} y={968} w={1680}>
            <p className="text-[17px] text-[#64748B]">A continuidade depende de seleção, adesão e das condições aplicáveis. O Projeto 3 permanece hipótese de continuidade enquanto não for formalizado.</p>
          </Movable>
          <SceneNotes scene={1} />
        </>
      ) : (
        <SceneCourses />
      )}
      <div role="tablist" aria-label="Visão da jornada" className="absolute top-[96px] right-[120px] flex rounded-full border-2 border-[#DFE6EE] bg-white p-1">
        {([["jornada", "Jornada e turmas"], ["cursos", "Cursos técnicos em detalhe"]] as const).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
            className={cn("rounded-full px-4 py-1.5 text-[16px] font-semibold", tab === id ? "bg-[#173B63] text-white" : "text-[#18324A]")}>
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}
