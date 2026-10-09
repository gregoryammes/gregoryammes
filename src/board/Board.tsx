import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { ArrowLeft, ChevronLeft, ChevronRight, Maximize, PencilRuler, Plus, RotateCcw, StickyNote } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useStudio, uid } from "@/store/store"
import { useActiveScenario } from "@/store/hooks"
import { STAGE_H, STAGE_W, StageScale } from "./Stage"
import { Scene1 } from "./Scene1"
import { Scene2 } from "./Scene2"
import { Scene3 } from "./Scene3"
import { Scene4 } from "./Scene4"
import { Logo } from "@/studio/TopBar"
import { confirmAction } from "@/components/Confirm"

const SCENES = [
  { title: "Evolução", C: Scene1 },
  { title: "Jornada do aluno", C: Scene2 },
  { title: "Desafio da vigência", C: Scene3 },
  { title: "Decisões", C: Scene4 },
]

export default function Board() {
  const scene = useStudio((s) => s.scene)
  const setScene = useStudio((s) => s.setScene)
  const setMode = useStudio((s) => s.setMode)
  const design = useStudio((s) => s.designMode)
  const setDesign = useStudio((s) => s.setDesignMode)
  const scenario = useActiveScenario()
  const scenarios = useStudio((s) => s.doc.scenarios)
  const setScenario = useStudio((s) => s.setScenario)
  const reduce = useReducedMotion()
  const wrap = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.5)
  const [dir, setDir] = useState(1)

  useLayoutEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setScale(Math.min(e.contentRect.width / STAGE_W, e.contentRect.height / STAGE_H)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const go = (n: number) => {
    const t = Math.max(0, Math.min(SCENES.length - 1, n))
    if (t === scene) return
    setDir(t > scene ? 1 : -1)
    setScene(t)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.isContentEditable || t.closest("input,select,textarea")) return
      if (e.key === "ArrowRight" || e.key === "PageDown") go(scene + 1)
      else if (e.key === "ArrowLeft" || e.key === "PageUp") go(scene - 1)
      else if (/^[1-4]$/.test(e.key)) go(+e.key - 1)
      else if (e.key === "Escape") design ? setDesign(false) : setMode("studio")
      else if (e.key.toLowerCase() === "d" && !e.metaKey && !e.ctrlKey) setDesign(!design)
      else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault()
        if (e.shiftKey) useStudio.getState().redo()
        else useStudio.getState().undo()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  const { C } = SCENES[scene]
  const isSim = scenario.kind !== "baseline"

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#030817]">
      {/* Chrome — intentionally quiet so the stage carries the room */}
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-white/5 px-3">
        <Button size="sm" variant="ghost" onClick={() => setMode("studio")}>
          <ArrowLeft className="size-3.5" /> Estúdio
        </Button>
        <div className="mx-auto flex items-center gap-1">
          <Button size="icon" variant="ghost" aria-label="Cena anterior" disabled={scene === 0} onClick={() => go(scene - 1)}><ChevronLeft className="size-4" /></Button>
          {SCENES.map((s, i) => (
            <button key={i} onClick={() => go(i)} className={cn("rounded-full px-3 py-1 text-xs font-semibold transition-colors", i === scene ? "bg-white text-[#0A1633]" : "text-muted-foreground hover:text-foreground")}>
              {i + 1}. {s.title}
            </button>
          ))}
          <Button size="icon" variant="ghost" aria-label="Próxima cena" disabled={scene === SCENES.length - 1} onClick={() => go(scene + 1)}><ChevronRight className="size-4" /></Button>
        </div>
        <select aria-label="Cenário apresentado" className="field !w-[260px] !py-1" value={scenario.id} onChange={(e) => setScenario(e.target.value)}>
          {scenarios.map((s) => <option key={s.id} value={s.id}>{s.kind === "baseline" ? "● " : "◌ "}{s.name}</option>)}
        </select>
        {design && (
          <>
            <Button size="sm" variant="ghost" onClick={() => useStudio.getState().addSceneNote({ id: uid("note"), scene, text: "Nova nota", x: 760, y: 470, arrow: false })}>
              <StickyNote className="size-3.5" /> Nota
            </Button>
            <Button size="sm" variant="ghost" onClick={async () => (await confirmAction("Restaurar a composição original desta cena?")) && useStudio.getState().resetLayout(scene)}>
              <RotateCcw className="size-3.5" /> Composição
            </Button>
          </>
        )}
        <Button size="sm" variant="ghost" active={design} title="Modo Design (D)" onClick={() => setDesign(!design)}>
          <PencilRuler className="size-3.5" /> Design
        </Button>
        <Button size="icon" variant="ghost" title="Tela cheia" onClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.().catch(() => {}))}>
          <Maximize className="size-4" />
        </Button>
      </div>

      <div ref={wrap} className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden p-3">
        <StageScale.Provider value={scale}>
          <div
            className="relative shrink-0 overflow-hidden rounded-[6px] shadow-[0_40px_120px_-20px_rgba(0,0,0,0.8)]"
            style={{ width: STAGE_W * scale, height: STAGE_H * scale }}
          >
            <div
              className="absolute top-0 left-0 origin-top-left overflow-hidden"
              style={{ width: STAGE_W, height: STAGE_H, transform: `scale(${scale})`, background: "radial-gradient(120% 90% at 70% 0%, #0E2257 0%, #071334 45%, #040A1F 100%)" }}
            >
              <AnimatePresence mode="wait" custom={dir}>
                <motion.div
                  key={scene}
                  custom={dir}
                  className="absolute inset-0"
                  initial={reduce ? { opacity: 0 } : { opacity: 0, x: 80 * dir, scale: 0.985, filter: "blur(6px)" }}
                  animate={{ opacity: 1, x: 0, scale: 1, filter: "blur(0px)" }}
                  exit={reduce ? { opacity: 0 } : { opacity: 0, x: -60 * dir, scale: 0.99, filter: "blur(4px)" }}
                  transition={{ duration: reduce ? 0.15 : 0.55, ease: [0.22, 1, 0.36, 1] }}
                >
                  <C />
                </motion.div>
              </AnimatePresence>

              {/* Footer brand + simulation ribbon, on every scene */}
              <div className="pointer-events-none absolute right-[120px] bottom-[22px] left-[120px] flex items-center gap-4 text-[17px] text-[#7F92C2]">
                <Logo size={30} />
                <span className="font-semibold tracking-[0.18em] text-[#BFD0F5]">SKA TECH HUB</span>
                <span>Mondaí · Educação, tecnologia, indústria e inovação</span>
                <span className="ml-auto font-mono text-[15px]">{scene + 1} / {SCENES.length}</span>
              </div>
              {isSim && (
                <div className="pointer-events-none absolute top-[34px] right-[120px] flex items-center gap-3 rounded-full border-2 border-dashed border-[#C4B5FD] bg-[#1B1240]/80 px-5 py-2 text-[18px] font-semibold text-[#E4DCFF]">
                  <span className="rounded-full bg-[#C4B5FD] px-2.5 py-0.5 text-[14px] font-bold tracking-wider text-[#1B1240]">SIMULAÇÃO</span>
                  {scenario.name} — não representa aprovação
                </div>
              )}
              {design && (
                <div className="pointer-events-none absolute inset-0 border-[3px] border-dashed border-[#2EA8FF]/50">
                  <div className="absolute top-3 left-1/2 -translate-x-1/2 rounded-full bg-[#2EA8FF] px-4 py-1 text-[16px] font-bold text-[#04122B]">
                    MODO DESIGN — composição visual. Datas e registros não são alterados aqui.
                  </div>
                </div>
              )}
            </div>
          </div>
        </StageScale.Provider>
      </div>
      {design && (
        <div className="flex h-9 shrink-0 items-center justify-center gap-4 border-t border-white/5 text-[11.5px] text-muted-foreground">
          <span><Plus className="mr-1 inline size-3" />Arraste caixas para reposicionar · alça azul ajusta a largura · barra flutuante: ocultar, escala e cor · notas são editáveis no texto</span>
        </div>
      )}
    </div>
  )
}
