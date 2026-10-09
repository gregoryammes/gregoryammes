import { useMemo } from "react"
import { applyScenario, computeIndicators, computeOverruns } from "@/lib/analysis"
import { useStudio } from "./store"

/** Effective records of the active scenario — the single source for both Studio and Diretoria. */
export function useEffectiveItems() {
  const doc = useStudio((s) => s.doc)
  const scenarioId = useStudio((s) => s.scenarioId)
  return useMemo(() => applyScenario(doc, scenarioId), [doc, scenarioId])
}

export function useCompareItems() {
  const doc = useStudio((s) => s.doc)
  const compareId = useStudio((s) => s.compareId)
  return useMemo(() => (compareId ? applyScenario(doc, compareId) : null), [doc, compareId])
}

export function useAnalysis() {
  const doc = useStudio((s) => s.doc)
  const items = useEffectiveItems()
  return useMemo(() => ({ items, overruns: computeOverruns(items), indicators: computeIndicators(doc, items) }), [doc, items])
}

export function useActiveScenario() {
  const doc = useStudio((s) => s.doc)
  const id = useStudio((s) => s.scenarioId)
  return doc.scenarios.find((s) => s.id === id) ?? doc.scenarios[0]
}

export function useProjectColor() {
  const projects = useStudio((s) => s.doc.projects)
  return useMemo(() => {
    const m = new Map(projects.map((p) => [p.id, p.color]))
    return (projectId: string | null, fallback = "#7C8DB5") => (projectId && m.get(projectId)) || fallback
  }, [projects])
}
