import { calendarMonthsTouched, fmtMonthsSpan, partAfter } from "@/lib/dates"
import { docVigRange, shortNameOf } from "@/lib/v6"
import { TwoTimes } from "@/studio/TwoTimes"
import { useStudio } from "@/store/store"
import { useEffectiveItems } from "@/store/hooks"
import { Movable, SceneNotes, SceneTitle } from "./Stage"

/** Scene 3 — Dois Tempos do Projeto: the vigência rail and the execution rail on one scale. */
export function Scene3() {
  const doc = useStudio((s) => s.doc)
  const items = useEffectiveItems()
  const vig = docVigRange(doc)
  const course = items.find((i) => i.id === (doc.presentation.highlightCourseIds[0] ?? "t1")) ?? items.find((i) => i.kind === "curso" && i.certainty !== "hipotese")
  const after = course && vig ? partAfter(course.range, vig) : null
  return (
    <div className="absolute inset-0">
      <SceneTitle scene={2} n={3} eyebrow="Dois tempos do projeto" title="A vigência termina. A formação continua." size={60} />
      <Movable k="s2:headline" x={120} y={206} w={1160}>
        <p className="text-[23px] leading-snug text-[#18324A]">
          {after && course ? (
            <>
              <b className="text-[#9A4A08]">{calendarMonthsTouched(after)} meses-calendário</b> de formação do {shortNameOf(course)} após o encerramento da vigência de referência
              <span className="text-[#64748B]"> ({fmtMonthsSpan(after)})</span>.
            </>
          ) : (
            <>Neste cenário, o curso termina dentro da vigência de referência.</>
          )}
        </p>
      </Movable>
      <div className="absolute top-[286px] left-[120px] w-[1680px]">
        <TwoTimes size="stage" />
      </div>
      <SceneNotes scene={2} />
    </div>
  )
}
