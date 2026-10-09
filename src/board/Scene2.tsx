import { JourneyMatrix } from "@/studio/JourneyMatrix"
import { Movable, SceneNotes, SceneTitle } from "./Stage"

/** Scene 2 — the same journey matrix as the Studio, at presentation scale. */
export function Scene2() {
  return (
    <div className="absolute inset-0">
      <SceneTitle scene={1} eyebrow="Formação e continuidade" title="A formação ultrapassa os limites de um único projeto" size={58} />
      <div className="absolute top-[236px] left-[120px] h-[700px] w-[1680px]">
        <JourneyMatrix size="stage" />
      </div>
      <Movable k="s1:disclaimer" x={120} y={958} w={1680}>
        <p className="text-[17px] text-[#64748B]">
          Turmas identificadas pelo ano do 9º ano. Não presume que todos os estudantes percorram todas as etapas: a continuidade depende de seleção, adesão e das condições aplicáveis.
        </p>
      </Movable>
      <SceneNotes scene={1} />
    </div>
  )
}
