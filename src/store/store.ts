import { create } from "zustand"
import { createSeed } from "@/data/seed"
import { needsMigration, normalizeDoc } from "@/data/migrate"
import { groupOf, layerFor, type GroupId } from "@/data/types"
import type { Annotation, BoxLayout, Item, Link, SceneNote, Scenario, StudioDoc } from "@/data/types"
import type { SpanKind, SpanStatus } from "@/components/ui/agent-trace"

const STORAGE_KEY = "ska-temporal-studio:v1"
const HISTORY_LIMIT = 200

export type Mode = "studio" | "board"

export interface AuditEvent {
  id: string
  label: string
  kind: SpanKind
  status: SpanStatus
  start: number
  end: number
  detail?: string
}

export interface Toast {
  id: number
  text: string
  tone: "info" | "warn" | "ok"
}

interface Transaction {
  label: string
  before: StudioDoc
  startedAt: number
}

export interface StudioState {
  doc: StudioDoc
  past: { doc: StudioDoc; label: string }[]
  future: { doc: StudioDoc; label: string }[]
  tx: Transaction | null
  dirtySinceSave: boolean

  mode: Mode
  scenarioId: string
  compareId: string | null
  selection: string[]
  selectedAnnotation: string | null
  /** V8: a financial record selected on a component row. */
  selectedFin: string | null
  selectFin: (id: string | null) => void
  clipboard: Item[]
  designMode: boolean
  scene: number
  toasts: Toast[]
  audit: AuditEvent[]
  sessionStart: number
  editingItemId: string | null

  // History
  commit: (label: string, fn: (d: StudioDoc) => StudioDoc, detail?: string) => void
  begin: (label: string) => void
  live: (fn: (d: StudioDoc) => StudioDoc) => void
  end: (detail?: string) => void
  cancel: () => void
  undo: () => void
  redo: () => void

  // Items
  /** Returns the scenario that will receive an edit, switching away from the baseline when a vigência would change. */
  prepareEdit: (id: string, temporal: boolean) => string | null
  patchItem: (id: string, patch: Partial<Item>, label?: string) => void
  livePatchItems: (patches: Record<string, Partial<Item>>) => void
  addItem: (item: Item) => void
  deleteItems: (ids: string[]) => void
  duplicateItems: (ids: string[]) => void
  copy: () => void
  paste: () => void

  // Annotations, links
  addAnnotation: (a: Annotation) => void
  patchAnnotation: (id: string, patch: Partial<Annotation>, live?: boolean) => void
  deleteAnnotation: (id: string) => void
  addLink: (l: Link) => void
  deleteLink: (id: string) => void

  // Scenarios
  setScenario: (id: string) => void
  setCompare: (id: string | null) => void
  createScenario: (fromId: string, name: string) => void
  resetScenario: (id: string) => void
  renameScenario: (id: string, name: string) => void

  // Presentation composition
  setLayout: (key: string, box: Partial<BoxLayout>, live?: boolean) => void
  resetLayout: (scene: number) => void
  addSceneNote: (n: SceneNote) => void
  patchSceneNote: (id: string, patch: Partial<SceneNote>, live?: boolean) => void
  deleteSceneNote: (id: string) => void

  // UI
  select: (ids: string[], additive?: boolean) => void
  setMode: (m: Mode) => void
  setScene: (n: number) => void
  setDesignMode: (v: boolean) => void
  setEditing: (id: string | null) => void
  toast: (text: string, tone?: Toast["tone"]) => void
  dismissToast: (id: number) => void
  log: (e: Omit<AuditEvent, "id" | "start" | "end"> & { start?: number; end?: number }) => void

  // Persistence
  save: () => void
  exportJSON: () => string
  importJSON: (text: string) => boolean
  resetToSeed: () => void
}

export const uid = (p = "id") => `${p}-${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-3)}`

function loadInitial(): { doc: StudioDoc; scenarioId: string; restored: boolean } {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (isDoc(parsed.doc)) {
        // Back up the saved document untouched before any migration rewrites it.
        if (needsMigration(parsed.doc)) {
          try {
            window.localStorage.setItem(`${STORAGE_KEY}:backup-v${parsed.doc.settings.modelVersion ?? 5}`, raw)
          } catch {
            /* best effort */
          }
        }
        return { doc: normalizeDoc(parsed.doc), scenarioId: parsed.scenarioId ?? "baseline", restored: true }
      }
    }
  } catch {
    /* storage unavailable or corrupt: fall back to seed */
  }
  return { doc: createSeed(), scenarioId: "baseline", restored: false }
}

export function isDoc(d: unknown): d is StudioDoc {
  const x = d as StudioDoc
  return !!x && x.schema === "ska-temporal-studio/1" && Array.isArray(x.items) && Array.isArray(x.scenarios) && !!x.settings
}

function persist(doc: StudioDoc, scenarioId: string) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ doc, scenarioId }))
    return true
  } catch {
    return false
  }
}

const touch = (d: StudioDoc): StudioDoc => ({ ...d, meta: { ...d.meta, updatedAt: new Date().toISOString() } })

function mapScenario(d: StudioDoc, id: string, fn: (s: Scenario) => Scenario): StudioDoc {
  return { ...d, scenarios: d.scenarios.map((s) => (s.id === id ? fn(s) : s)) }
}

/** Writes a patch to the right place: the baseline record, a scenario override, or a scenario-only item. */
const VISUAL_KEYS = new Set(["lane", "layer", "color", "detail", "turmaIds", "consolidation", "partner", "shortName", "courseId", "funding"])

/**
 * Composition fields (row order, group, colour) belong to the record's presentation, not to its
 * evidence: they are written where the record lives (baseline or scenario-only), never as a
 * scenario hypothesis.
 */
export function writeVisual(d: StudioDoc, scenarioId: string, id: string, patch: Partial<Item>): StudioDoc {
  if (d.items.some((i) => i.id === id)) return { ...d, items: d.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) }
  return mapScenario(d, scenarioId, (s) => ({ ...s, added: s.added.map((i) => (i.id === id ? { ...i, ...patch } : i)) }))
}

/** Places `id` at `index` among `order` (the ids currently shown in `group`) and renumbers the rows. */
export function reorderRows(d: StudioDoc, scenarioId: string, id: string, group: GroupId, order: string[], index: number): StudioDoc {
  const ids = order.filter((x) => x !== id)
  ids.splice(Math.max(0, Math.min(ids.length, index)), 0, id)
  const sc = d.scenarios.find((x) => x.id === scenarioId)
  const all = [...d.items, ...(sc?.added ?? [])]
  let next = d
  ids.forEach((rid, i) => {
    const it = all.find((x) => x.id === rid)
    if (!it) return
    const patch: Partial<Item> = { lane: i }
    if (rid === id && groupOf(it) !== group) patch.layer = layerFor(it.kind, group)
    next = writeVisual(next, scenarioId, rid, patch)
  })
  return next
}

export function writePatch(d: StudioDoc, scenarioId: string, id: string, patch: Partial<Item>): StudioDoc {
  const sc = d.scenarios.find((s) => s.id === scenarioId)
  if (!sc || sc.kind === "baseline") {
    return { ...d, items: d.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) }
  }
  if (sc.added.some((i) => i.id === id)) {
    return mapScenario(d, scenarioId, (s) => ({ ...s, added: s.added.map((i) => (i.id === id ? { ...i, ...patch } : i)) }))
  }
  const baseItem = d.items.find((i) => i.id === id)
  return mapScenario(d, scenarioId, (s) => {
    const merged: Partial<Item> = { ...s.overrides[id], ...patch }
    // Drop fields that went back to baseline, so "changed" really means changed.
    if (baseItem) {
      for (const k of Object.keys(merged) as (keyof Item)[]) {
        if (merged[k] === baseItem[k]) delete merged[k]
      }
    }
    const overrides = { ...s.overrides }
    if (Object.keys(merged).length) overrides[id] = merged
    else delete overrides[id]
    return { ...s, overrides }
  })
}

const initial = loadInitial()
let toastSeq = 1

export const useStudio = create<StudioState>((set, get) => ({
  doc: initial.doc,
  past: [],
  future: [],
  tx: null,
  dirtySinceSave: false,

  mode: "studio",
  scenarioId: initial.scenarioId,
  compareId: null,
  selection: [],
  selectedAnnotation: null,
  selectedFin: null,
  selectFin: (id) => set({ selectedFin: id, selection: [], selectedAnnotation: null }),
  clipboard: [],
  designMode: false,
  scene: 0,
  toasts: initial.restored
    ? [{ id: toastSeq++, text: "Planejamento restaurado do armazenamento local deste navegador.", tone: "ok" }]
    : [],
  audit: [],
  sessionStart: performance.now(),
  editingItemId: null,

  commit: (label, fn, detail) => {
    const s = get()
    const before = s.doc
    const next = fn(before)
    if (next === before) return
    const t = performance.now()
    set({
      doc: touch(next),
      past: [...s.past, { doc: before, label }].slice(-HISTORY_LIMIT),
      future: [],
      dirtySinceSave: true,
    })
    get().log({ label, kind: "tool", status: "ok", detail, start: t, end: t + 120 })
  },
  begin: (label) => set({ tx: { label, before: get().doc, startedAt: performance.now() } }),
  live: (fn) => set({ doc: fn(get().doc) }),
  end: (detail) => {
    const s = get()
    if (!s.tx) return
    const { before, label, startedAt } = s.tx
    if (s.doc === before) {
      set({ tx: null })
      return
    }
    set({
      tx: null,
      doc: touch(s.doc),
      past: [...s.past, { doc: before, label }].slice(-HISTORY_LIMIT),
      future: [],
      dirtySinceSave: true,
    })
    get().log({ label, kind: "tool", status: "ok", detail, start: startedAt, end: performance.now() })
  },
  cancel: () => {
    const tx = get().tx
    if (tx) set({ doc: tx.before, tx: null })
  },
  undo: () => {
    const s = get()
    const last = s.past[s.past.length - 1]
    if (!last) return
    set({ doc: last.doc, past: s.past.slice(0, -1), future: [{ doc: s.doc, label: last.label }, ...s.future], dirtySinceSave: true })
    get().log({ label: `desfazer · ${last.label}`, kind: "tool", status: "cached" })
  },
  redo: () => {
    const s = get()
    const next = s.future[0]
    if (!next) return
    set({ doc: next.doc, future: s.future.slice(1), past: [...s.past, { doc: s.doc, label: next.label }], dirtySinceSave: true })
    get().log({ label: `refazer · ${next.label}`, kind: "tool", status: "cached" })
  },

  prepareEdit: (id, temporal) => {
    const s = get()
    const sc = s.doc.scenarios.find((x) => x.id === s.scenarioId)
    const inBase = s.doc.items.find((i) => i.id === id)
    const added = sc?.added.find((i) => i.id === id)
    const item = added ?? (inBase ? { ...inBase, ...sc?.overrides[id] } : undefined)
    if (!item) return null
    if (item.locked) {
      get().toast(`“${item.name}” está bloqueado. Desbloqueie no painel de propriedades para editar.`, "warn")
      get().log({ label: `bloqueado · ${item.name}`, kind: "tool", status: "error", detail: "bloqueado" })
      return null
    }
    if (sc?.kind === "baseline" && temporal && item.kind === "vigencia") {
      const working = s.doc.scenarios.find((x) => x.kind === "working") ?? s.doc.scenarios.find((x) => x.kind !== "baseline")
      if (!working) return null
      set({ scenarioId: working.id })
      get().toast(
        `A vigência documental não é alterada. A mudança foi registrada como hipótese em “${working.name}”.`,
        "warn",
      )
      get().log({ label: `cenário → ${working.name}`, kind: "model", status: "ok", detail: "proteção da base" })
      return working.id
    }
    return s.scenarioId
  },
  patchItem: (id, patch, label = "editar") => {
    const temporal = "start" in patch || "end" in patch
    const target = get().prepareEdit(id, temporal)
    if (!target) return
    get().commit(label, (d) => {
      const visual: Partial<Item> = {}
      const data: Partial<Item> = {}
      for (const [k, v] of Object.entries(patch)) (VISUAL_KEYS.has(k) ? (visual as Record<string, unknown>) : (data as Record<string, unknown>))[k] = v
      let out = Object.keys(data).length ? writePatch(d, target, id, data) : d
      if (Object.keys(visual).length) out = writeVisual(out, target, id, visual)
      return out
    })
  },
  livePatchItems: (patches) => {
    const sid = get().scenarioId
    get().live((d) =>
      Object.entries(patches).reduce((acc, [id, p]) => {
        const visual: Partial<Item> = {}
        const data: Partial<Item> = {}
        for (const [k, v] of Object.entries(p)) (VISUAL_KEYS.has(k) ? (visual as Record<string, unknown>) : (data as Record<string, unknown>))[k] = v
        let out = acc
        if (Object.keys(data).length) out = writePatch(out, sid, id, data)
        if (Object.keys(visual).length) out = writeVisual(out, sid, id, visual)
        return out
      }, d),
    )
  },
  addItem: (item) => {
    const s = get()
    const sc = s.doc.scenarios.find((x) => x.id === s.scenarioId)
    get().commit(`criar · ${item.name}`, (d) =>
      !sc || sc.kind === "baseline"
        ? { ...d, items: [...d.items, item] }
        : mapScenario(d, sc.id, (x) => ({ ...x, added: [...x.added, { ...item, certainty: "hipotese" }] })),
    )
    if (sc && sc.kind !== "baseline") get().toast(`Criado apenas em “${sc.name}” (hipótese).`, "info")
    set({ selection: [item.id] })
  },
  deleteItems: (ids) => {
    const s = get()
    const sc = s.doc.scenarios.find((x) => x.id === s.scenarioId)
    const idSet = new Set(ids)
    get().commit(`excluir ${ids.length}`, (d) => {
      if (!sc || sc.kind === "baseline") {
        return {
          ...d,
          items: d.items.filter((i) => !idSet.has(i.id)),
          links: d.links.filter((l) => !idSet.has(l.from) && !idSet.has(l.to)),
          annotations: d.annotations.map((a) => (a.linkedItemId && idSet.has(a.linkedItemId) ? { ...a, linkedItemId: null } : a)),
          scenarios: d.scenarios.map((x) => {
            const overrides = { ...x.overrides }
            ids.forEach((i) => delete overrides[i])
            return { ...x, overrides, removed: x.removed.filter((r) => !idSet.has(r)) }
          }),
        }
      }
      return mapScenario(d, sc.id, (x) => ({
        ...x,
        added: x.added.filter((i) => !idSet.has(i.id)),
        removed: [...new Set([...x.removed, ...ids.filter((i) => d.items.some((b) => b.id === i))])],
      }))
    })
    set({ selection: [] })
  },
  duplicateItems: (ids) => {
    const s = get()
    const sc = s.doc.scenarios.find((x) => x.id === s.scenarioId)
    const source = [...s.doc.items, ...(sc?.added ?? [])].filter((i) => ids.includes(i.id))
    const copies = source.map((i) => ({ ...i, ...sc?.overrides[i.id], id: uid(i.kind), name: `${i.name} (cópia)`, lane: i.lane + 1, locked: false }))
    if (!copies.length) return
    get().commit(`duplicar ${copies.length}`, (d) =>
      !sc || sc.kind === "baseline"
        ? { ...d, items: [...d.items, ...copies] }
        : mapScenario(d, sc.id, (x) => ({ ...x, added: [...x.added, ...copies.map((c) => ({ ...c, certainty: "hipotese" as const }))] })),
    )
    set({ selection: copies.map((c) => c.id) })
  },
  copy: () => {
    const s = get()
    const sc = s.doc.scenarios.find((x) => x.id === s.scenarioId)
    const items = [...s.doc.items, ...(sc?.added ?? [])]
      .filter((i) => s.selection.includes(i.id))
      .map((i) => ({ ...i, ...sc?.overrides[i.id] }))
    set({ clipboard: items })
    if (items.length) get().toast(`${items.length} elemento(s) copiado(s).`, "info")
  },
  paste: () => {
    const clip = get().clipboard
    if (!clip.length) return
    const s = get()
    const sc = s.doc.scenarios.find((x) => x.id === s.scenarioId)
    const copies = clip.map((i) => ({ ...i, id: uid(i.kind), name: `${i.name} (colado)`, lane: i.lane + 1, locked: false }))
    get().commit(`colar ${copies.length}`, (d) =>
      !sc || sc.kind === "baseline"
        ? { ...d, items: [...d.items, ...copies] }
        : mapScenario(d, sc.id, (x) => ({ ...x, added: [...x.added, ...copies.map((c) => ({ ...c, certainty: "hipotese" as const }))] })),
    )
    set({ selection: copies.map((c) => c.id) })
  },

  addAnnotation: (a) => {
    get().commit("anotação", (d) => ({ ...d, annotations: [...d.annotations, a] }))
    set({ selectedAnnotation: a.id, selection: [], selectedFin: null })
  },
  patchAnnotation: (id, patch, live) => {
    const fn = (d: StudioDoc) => ({ ...d, annotations: d.annotations.map((a) => (a.id === id ? { ...a, ...patch } : a)) })
    if (live) get().live(fn)
    else get().commit("anotação", fn)
  },
  deleteAnnotation: (id) => {
    get().commit("excluir anotação", (d) => ({ ...d, annotations: d.annotations.filter((a) => a.id !== id) }))
    set({ selectedAnnotation: null })
  },
  addLink: (l) => {
    if (l.from === l.to || get().doc.links.some((x) => x.from === l.from && x.to === l.to)) return
    get().commit("conectar", (d) => ({ ...d, links: [...d.links, l] }))
  },
  deleteLink: (id) => get().commit("remover conexão", (d) => ({ ...d, links: d.links.filter((l) => l.id !== id) })),

  setScenario: (id) => {
    set({ scenarioId: id, compareId: get().compareId === id ? null : get().compareId })
    const sc = get().doc.scenarios.find((s) => s.id === id)
    get().log({ label: `cenário → ${sc?.name ?? id}`, kind: "model", status: "ok" })
    persist(get().doc, id)
  },
  setCompare: (id) => set({ compareId: id }),
  createScenario: (fromId, name) => {
    const src = get().doc.scenarios.find((s) => s.id === fromId)
    const sc: Scenario = {
      id: uid("sc"),
      name,
      kind: "alternative",
      description: `Derivado de “${src?.name ?? "base"}”. Hipótese.`,
      overrides: structuredClone(src?.overrides ?? {}),
      added: structuredClone(src?.added ?? []),
      removed: [...(src?.removed ?? [])],
    }
    get().commit(`novo cenário · ${name}`, (d) => ({ ...d, scenarios: [...d.scenarios, sc] }))
    set({ scenarioId: sc.id })
  },
  resetScenario: (id) =>
    get().commit("limpar cenário", (d) => mapScenario(d, id, (s) => ({ ...s, overrides: {}, added: [], removed: [] }))),
  renameScenario: (id, name) => get().commit("renomear cenário", (d) => mapScenario(d, id, (s) => ({ ...s, name }))),

  setLayout: (key, box, live) => {
    const fn = (d: StudioDoc) => ({
      ...d,
      presentation: { ...d.presentation, layout: { ...d.presentation.layout, [key]: { ...(d.presentation.layout[key] ?? { x: 0, y: 0 }), ...box } } },
    })
    if (live) get().live(fn)
    else get().commit("composição", fn)
  },
  resetLayout: (scene) =>
    get().commit("restaurar composição", (d) => ({
      ...d,
      presentation: {
        ...d.presentation,
        layout: Object.fromEntries(Object.entries(d.presentation.layout).filter(([k]) => !k.startsWith(`s${scene}:`))),
      },
    })),
  addSceneNote: (n) => get().commit("nota de cena", (d) => ({ ...d, presentation: { ...d.presentation, notes: [...d.presentation.notes, n] } })),
  patchSceneNote: (id, patch, live) => {
    const fn = (d: StudioDoc) => ({
      ...d,
      presentation: { ...d.presentation, notes: d.presentation.notes.map((n) => (n.id === id ? { ...n, ...patch } : n)) },
    })
    if (live) get().live(fn)
    else get().commit("nota de cena", fn)
  },
  deleteSceneNote: (id) =>
    get().commit("excluir nota", (d) => ({ ...d, presentation: { ...d.presentation, notes: d.presentation.notes.filter((n) => n.id !== id) } })),

  select: (ids, additive) => {
    const cur = get().selection
    if (!additive) set({ selection: ids, selectedAnnotation: null, selectedFin: null })
    else {
      const next = new Set(cur)
      ids.forEach((i) => (next.has(i) ? next.delete(i) : next.add(i)))
      set({ selection: [...next], selectedAnnotation: null, selectedFin: null })
    }
  },
  setMode: (m) => {
    set({ mode: m })
    get().log({ label: m === "board" ? "abrir Modo Diretoria" : "voltar ao Estúdio", kind: "agent", status: "ok" })
  },
  setScene: (n) => set({ scene: Math.max(0, Math.min(4, n)) }),
  setDesignMode: (v) => set({ designMode: v }),
  setEditing: (id) => set({ editingItemId: id }),
  toast: (text, tone = "info") => {
    const id = toastSeq++
    set({ toasts: [...get().toasts.slice(-3), { id, text, tone }] })
    window.setTimeout(() => get().dismissToast(id), 5200)
  },
  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
  log: (e) => {
    const now = performance.now()
    const s = get()
    const start = (e.start ?? now) - s.sessionStart
    const end = Math.max(start + 80, (e.end ?? now + 80) - s.sessionStart)
    set({ audit: [...s.audit, { id: uid("ev"), label: e.label, kind: e.kind, status: e.status, detail: e.detail, start, end }].slice(-60) })
  },

  save: () => {
    const s = get()
    const doc = { ...s.doc, meta: { ...s.doc.meta, savedAt: new Date().toISOString() } }
    const ok = persist(doc, s.scenarioId)
    set({ doc, dirtySinceSave: !ok })
    get().toast(
      ok ? "Salvo no armazenamento local deste navegador. Use Exportar JSON para backup." : "Armazenamento local indisponível aqui. Use Exportar JSON.",
      ok ? "ok" : "warn",
    )
    get().log({ label: "salvar", kind: "io", status: ok ? "ok" : "error", detail: ok ? "localStorage" : "indisponível" })
  },
  exportJSON: () => {
    get().log({ label: "exportar JSON", kind: "io", status: "ok" })
    return JSON.stringify(get().doc, null, 2)
  },
  importJSON: (text) => {
    try {
      const raw = JSON.parse(text)
      if (!isDoc(raw)) throw new Error("schema")
      const d = normalizeDoc(raw)
      const s = get()
      set({
        doc: d,
        past: [...s.past, { doc: s.doc, label: "importar" }],
        future: [],
        selection: [],
        scenarioId: d.scenarios.some((x) => x.id === s.scenarioId) ? s.scenarioId : d.scenarios[0].id,
      })
      persist(d, get().scenarioId)
      get().toast("Planejamento importado. É possível desfazer.", "ok")
      get().log({ label: "importar JSON", kind: "io", status: "ok", detail: `${d.items.length} registros` })
      return true
    } catch {
      get().toast("Arquivo inválido: esperado um JSON exportado pelo Temporal Studio.", "warn")
      get().log({ label: "importar JSON", kind: "io", status: "error", detail: "inválido" })
      return false
    }
  },
  resetToSeed: () => {
    const s = get()
    set({ doc: createSeed(), past: [...s.past, { doc: s.doc, label: "restaurar dados iniciais" }], future: [], selection: [], scenarioId: "baseline" })
    get().toast("Dados iniciais restaurados (é possível desfazer).", "info")
  },
}))

// Autosave: debounced, best effort, never blocks the UI.
let saveTimer = 0
useStudio.subscribe((s, prev) => {
  if (s.doc === prev.doc || s.tx) return
  window.clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => persist(useStudio.getState().doc, useStudio.getState().scenarioId), 800)
})

// Test hook (dev builds and the e2e script only): lets the scripted acceptance run read the store.
if (import.meta.env.DEV && typeof window !== "undefined") (window as unknown as { __studio: typeof useStudio }).__studio = useStudio
