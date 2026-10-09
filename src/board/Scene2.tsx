import { JourneyView } from "@/studio/JourneyView"
import { Movable, SceneNotes, SceneTitle } from "./Stage"

/** Scene 2 — the four-year journey from the same records; a turma can be selected. */
export function Scene2() {
  return (
    <div className="absolute inset-0">
      <SceneTitle scene={1} eyebrow="Jornada formativa" title="A formação ultrapassa os limites de um único projeto" size={58} />
      <div className="absolute top-[232px] left-[120px] h-[720px] w-[1680px]">
        <JourneyView size="stage" />
      </div>
      <Movable k="s1:disclaimer" x={120} y={968} w={1680}>
        <p className="text-[17px] text-[#64748B]">A continuidade depende de seleção, adesão e das condições aplicáveis. O Projeto 3 permanece hipótese de continuidade enquanto não for formalizado.</p>
      </Movable>
      <SceneNotes scene={1} />
    </div>
  )
}
