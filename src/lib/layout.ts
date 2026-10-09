import { GROUPS, groupOf, isDetail, type Consolidation, type FinRecord, type GroupId, type ModalityId } from "@/data/types"
import type { EffItem } from "./analysis"
import type { ActionInfo, Tag } from "./finance"

export const LABEL_W = 264
export const GROUP_H = 34
export const ROW_H = 40
export const BAR_H = 28
export const MORE_H = 28
export const PORTFOLIO_H = 64
/** Sub-lane height inside a consolidated row when segments overlap. */
export const SUB_H = 15
/** V8 hierarchy */
export const PROJECT_H = 46
export const COMP_H = 30
export const NOTE_H = 26

/** Hierarchy fields (V8): depth 0 = project, 1 = action, 2 = component. */
interface HierFields {
  depth?: number
  /** Toggle key: an item id or `cons:<key>`. */
  toggle?: string
  expanded?: boolean
  info?: ActionInfo
  /** Component rows are thinner. */
  thin?: boolean
  /** Shown in a visible project only because that project takes part in it. */
  via?: string
  /** V11 lane rendering: one compact tag, expand button on the bar. */
  compact?: boolean
  /** V18 carimbo financeiro (from the linked financial records). */
  stamp?: Tag
}

/** V11 — a row holding several records side by side, packed in sub-lanes by time. */
export interface LaneMember {
  item: EffItem
  lane: number
  info?: ActionInfo
  toggle?: string
  expanded?: boolean
  stamp?: Tag
}

export type ItemRow = { type: "item"; group: GroupId; top: number; h: number; item: EffItem; index: number; virtual?: "hyp"; portfolio?: boolean } & HierFields

export type CompKind = "aquisicao" | "nf" | "materiais" | "servicos" | "bolsas" | "sem_vinculo"

export const COMP_LABEL: Record<CompKind, string> = {
  aquisicao: "Aquisição e pagamento",
  nf: "Notas fiscais e comprovação",
  materiais: "Materiais e recursos",
  servicos: "Serviços complementares",
  bolsas: "Bolsas dos alunos",
  sem_vinculo: "Componentes · vínculo a validar",
}

export type Row =
  | { type: "group"; group: GroupId; top: number; h: number; count: number; hiddenDetail: number; collapsed: boolean; detailed: boolean; label?: string }
  | ItemRow
  | ({ type: "consolidated"; group: GroupId; top: number; h: number; key: string; name: string; subtitle?: string; members: EffItem[]; lanes: number[]; laneCount: number; index: number } & HierFields)
  | { type: "more"; group: GroupId; top: number; h: number; count: number }
  | { type: "project"; group: GroupId; top: number; h: number; projectId: string | null; item?: EffItem; collapsed: boolean; count: number; index: number }
  | { type: "comp"; group: GroupId; top: number; h: number; comp: CompKind; actionId: string | null; action?: EffItem; fins: FinRecord[]; empty?: string; index: number; depth: number; prefix?: string }
  | { type: "note"; group: GroupId; top: number; h: number; text: string; tone?: "warn" | "muted"; depth: number; index: number }
  | { type: "heading"; group: GroupId; top: number; h: number; text: string; index: number }
  | {
      type: "lane"; group: GroupId; top: number; h: number; kind: "project" | "plan" | "vig" | "modality"; label: string; sub?: string
      projectId?: string | null; modality?: ModalityId; members: LaneMember[]; laneCount: number; collapsed?: boolean; count: number; index: number; empty?: string
    }

export interface RowLayout {
  rows: Row[]
  total: number
  /** First row of an item (its documental row when a hypothesis row also exists). */
  rowOf: (id: string) => ItemRow | undefined
  /** Rows a dragged record can be dropped among. */
  orderOf: (g: GroupId) => string[]
  /** Insertion target for a vertical drop at body-y. */
  dropAt: (y: number) => Drop | null
  /** Every drawn record row, including the records inside lane rows. */
  itemRows?: ItemRow[]
}

/** Vertical drop: a row position (matrix) or a modality lane (V11). Never a date. */
export interface Drop {
  group: GroupId
  index: number
  lineY: number
  modality?: ModalityId
}

export const sortRows = (a: EffItem, b: EffItem) => a.lane - b.lane || a.range.start - b.range.start || a.name.localeCompare(b.name)

/** Greedy interval packing: overlapping segments of a consolidated row get separate sub-lanes. */
export function packLanes(members: EffItem[]) {
  const ends: number[] = []
  const lanes = members.map((m) => {
    let lane = ends.findIndex((e) => e <= m.range.start)
    if (lane < 0) lane = ends.length
    ends[lane] = m.range.end
    return lane
  })
  return { lanes, count: Math.max(1, ends.length) }
}

export interface RowOptions {
  hidden: GroupId[]
  collapsed: GroupId[]
  detailed: GroupId[]
  detailAll: boolean
  /** "projects" draws only the three cycles; "all" the full matrix. */
  portfolio?: boolean
  consolidations?: Consolidation[]
}

export function computeRows(items: EffItem[], opts: RowOptions): RowLayout {
  const rows: Row[] = []
  let y = 0
  const order = new Map<GroupId, string[]>()

  if (opts.portfolio) {
    const projects = items.filter((i) => i.kind === "projeto").sort((a, b) => a.range.start - b.range.start)
    rows.push({ type: "group", group: "g1", top: y, h: GROUP_H, count: projects.length, hiddenDetail: 0, collapsed: false, detailed: true, label: "Portfólio · Projetos 1, 2 e 3" })
    y += GROUP_H
    projects.forEach((it, index) => {
      rows.push({ type: "item", group: "g1", top: y, h: PORTFOLIO_H, item: it, index, portfolio: true })
      y += PORTFOLIO_H
    })
    return finish(rows, y + 8, order)
  }

  const cons = new Map((opts.consolidations ?? []).map((c) => [c.id, c]))
  for (const g of GROUPS) {
    if (opts.hidden.includes(g.id)) continue
    const all = items.filter((i) => groupOf(i) === g.id).sort(sortRows)
    const detailed = opts.detailAll || opts.detailed.includes(g.id)
    const shown = detailed ? all : all.filter((i) => !isDetail(i))
    const collapsed = opts.collapsed.includes(g.id)
    rows.push({ type: "group", group: g.id, top: y, h: GROUP_H, count: all.length, hiddenDetail: all.length - shown.length, collapsed, detailed })
    y += GROUP_H
    order.set(g.id, shown.filter((i) => !i.consolidation || !cons.has(i.consolidation)).map((i) => i.id))
    if (collapsed) continue
    const placed = new Set<string>()
    let index = 0
    for (const it of shown) {
      const key = it.consolidation
      if (key && cons.has(key)) {
        // One visual row for the whole programme; the records stay separate underneath.
        if (placed.has(key)) continue
        placed.add(key)
        const members = shown.filter((m) => m.consolidation === key).sort((a, b) => a.range.start - b.range.start)
        const { lanes, count } = packLanes(members)
        const h = Math.max(ROW_H, 12 + count * (SUB_H + 3))
        const c = cons.get(key)!
        rows.push({ type: "consolidated", group: g.id, top: y, h, key, name: c.name, subtitle: c.subtitle, members, lanes, laneCount: count, index })
        y += h
        index++
        continue
      }
      rows.push({ type: "item", group: g.id, top: y, h: ROW_H, item: it, index })
      y += ROW_H
      // A simulated vigência gets its own row under the documental one: one date never replaces the other.
      if (it.kind === "vigencia" && it.baseRange) {
        rows.push({ type: "item", group: g.id, top: y, h: ROW_H, item: it, index, virtual: "hyp" })
        y += ROW_H
      }
      index++
    }
    if (all.length > shown.length || (detailed && !opts.detailAll && all.some((i) => isDetail(i)))) {
      rows.push({ type: "more", group: g.id, top: y, h: MORE_H, count: all.length - shown.length })
      y += MORE_H
    }
    y += 8
  }
  return finish(rows, y, order)
}

export function finish(rows: Row[], total: number, order: Map<GroupId, string[]>, reorder = true): RowLayout {
  const itemRows = reorder ? rows.filter((r): r is ItemRow => r.type === "item" && !r.virtual && !r.portfolio) : []
  return {
    rows,
    total,
    rowOf: (id) => rows.find((r): r is ItemRow => r.type === "item" && r.item.id === id && !r.virtual),
    orderOf: (g) => order.get(g) ?? [],
    dropAt: (yy) => {
      if (!itemRows.length) return null
      let best = itemRows[0]
      for (const r of itemRows) if (yy >= r.top) best = r
      const ord = order.get(best.group) ?? []
      const idx = Math.max(0, ord.indexOf(best.item.id))
      const after = yy > best.top + best.h / 2
      return { group: best.group, index: idx + (after ? 1 : 0), lineY: after ? best.top + best.h : best.top }
    },
  }
}
