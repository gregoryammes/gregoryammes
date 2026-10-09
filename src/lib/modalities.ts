import type { EffItem } from "./analysis"
import { resolveActions, type ResolveOptions, type ResolvedAction } from "./hierarchy"
import { COMP_H, NOTE_H, ROW_H, type CompKind, type ItemRow, type LaneMember, type Row, type RowLayout } from "./layout"
import { MODALITIES, modalityOf, type FinRecord, type ModalityId } from "@/data/types"
import type { HierStats } from "./hierarchy"
import { financeStamp, stampTag } from "./finance"

/* ──────────────────────────────────────────────────────────────────────────────
 * V11 — the main timeline: a project region on top (three bands, the P2 plan and
 * vigência apart), then a few modality rows. Inside a modality, editions sit side
 * by side at their real dates; overlapping ones take a sub-lane. Components of a
 * course appear only when that course is expanded.
 * ────────────────────────────────────────────────────────────────────────────── */

export const LANE_H = 42
const PAD = 6
export const HEAD_H = 26

export interface ModOptions extends ResolveOptions {
  expanded: string[]
  collapsedModalities: string[]
  /** Show secondary planning records (e.g. the operational period). */
  detailAll: boolean
}

interface Placed {
  item: EffItem
  action?: ResolvedAction
  first: boolean
}

/** Greedy packing that honours a preferred lane when it is free. */
export function packPreferred(list: { start: number; end: number; pref?: number }[]): { lanes: number[]; count: number } {
  const occ: { start: number; end: number }[][] = []
  const free = (l: number, r: { start: number; end: number }) => !(occ[l] ?? []).some((o) => o.start < r.end && r.start < o.end)
  const lanes = list.map((r) => {
    let lane = r.pref != null && r.pref >= 0 && free(r.pref, r) ? r.pref : -1
    if (lane < 0) {
      lane = 0
      while (!free(lane, r)) lane++
    }
    ;(occ[lane] ??= []).push(r)
    return lane
  })
  return { lanes, count: Math.max(1, occ.length) }
}

export function computeModalities(o: ModOptions): RowLayout & { stats: HierStats } {
  const vis = (pid: string | null | undefined) => !pid || !o.hiddenProjects.includes(pid)
  const { actions, stats } = resolveActions(o)
  const short = (id: string | null | undefined) => o.doc.projects.find((p) => p.id === id)?.short ?? null
  const rows: Row[] = []
  const itemRows: ItemRow[] = []
  const rowOfMap = new Map<string, ItemRow>()
  let y = 0
  let zebra = 0
  const push = (r: Row) => {
    rows.push(r)
    y += r.h
  }
  const laneRow = (kind: "project" | "plan" | "vig" | "modality", label: string, members: LaneMember[], laneCount: number, extra: Partial<Extract<Row, { type: "lane" }>> = {}) => {
    const h = extra.collapsed ? 42 : Math.max(1, laneCount) * LANE_H + PAD * 2
    const r: Extract<Row, { type: "lane" }> = { type: "lane", group: kind === "modality" ? "g2" : "g1", top: y, h, kind, label, members, laneCount, count: members.length, index: zebra++, ...extra }
    if (!extra.collapsed)
      for (const m of members) {
        const ir: ItemRow = { type: "item", group: r.group, top: y + PAD + m.lane * LANE_H, h: LANE_H, item: m.item, index: r.index, info: m.info, toggle: m.toggle, expanded: m.expanded, compact: true, stamp: m.stamp }
        itemRows.push(ir)
        if (!rowOfMap.has(m.item.id)) rowOfMap.set(m.item.id, ir)
      }
    push(r)
    return r
  }
  const single = (items: EffItem[]) => {
    const sorted = [...items].sort((a, b) => a.range.start - b.range.start)
    const { lanes, count } = packPreferred(sorted.map((i) => ({ start: i.range.start, end: i.range.end })))
    return { members: sorted.map((item, k) => ({ item, lane: lanes[k] })), count }
  }

  // ── Region 1: projects ───────────────────────────────────────────────────
  push({ type: "heading", group: "g1", top: y, h: HEAD_H, text: "PROJETOS", index: zebra })
  for (const p of o.doc.projects) {
    if (!vis(p.id)) continue
    const cycle = o.items.filter((i) => i.kind === "projeto" && i.projectId === p.id)
    const own = o.items.filter((i) => i.projectId === p.id && !i.parentId)
    const plans = own.filter((i) => i.kind === "planejamento" && (o.detailAll || !i.detail))
    const vigs = own.filter((i) => i.kind === "vigencia")
    const marcos = own.filter((i) => i.kind === "marco")
    const c = single([...cycle, ...(vigs.length ? [] : marcos)])
    laneRow("project", p.name, c.members, c.count, { projectId: p.id, sub: p.phase })
    if (plans.length) {
      const pl = single(plans)
      laneRow("plan", "Planejamento original", pl.members, pl.count, { projectId: p.id, sub: plans.length > 1 ? `${plans.length} registros de planejamento` : "cronograma previsto" })
    }
    for (const v of vigs) {
      const vg = single([v, ...marcos])
      laneRow("vig", "Vigência de referência", vg.members, vg.count, { projectId: p.id, sub: "linha de base documental" })
      if (v.baseRange) {
        const ir: ItemRow = { type: "item", group: "g1", top: y, h: ROW_H, item: v, index: zebra - 1, depth: 1, virtual: "hyp" }
        push(ir)
      }
    }
  }
  y += 6

  // ── Region 2: modalities ─────────────────────────────────────────────────
  push({ type: "heading", group: "g2", top: y, h: HEAD_H, text: "LINHAS DE FORMAÇÃO", index: zebra })
  const byMod = new Map<ModalityId, ResolvedAction[]>()
  for (const a of actions) {
    const m = modalityOf(a.item)
    byMod.set(m, [...(byMod.get(m) ?? []), a])
  }
  for (const m of MODALITIES) {
    const list = byMod.get(m.id) ?? []
    if (m.id === "outras" && list.length === 0) continue
    if (m.id === "bolsas" && list.length === 0 && !o.items.some((i) => i.kind === "bolsa")) continue
    const collapsed = o.collapsedModalities.includes(m.id)
    // Single actions first (preferred lane honoured), then each consolidated programme in its own lanes.
    const singles = list.filter((a) => !a.members).sort((a, b) => a.item.range.start - b.item.range.start)
    const placed: Placed[] = singles.map((a) => ({ item: a.item, action: a, first: true }))
    const pack = packPreferred(singles.map((a) => ({ start: a.item.range.start, end: a.item.range.end, pref: a.item.modLane })))
    const members: LaneMember[] = placed.map((p, k) => ({ item: p.item, lane: pack.lanes[k], info: p.action?.info, toggle: p.action?.key, expanded: o.expanded.includes(p.action!.key), stamp: p.action ? stampTag(financeStamp(p.action.item, p.action.info.acq, short)) : undefined }))
    let laneCount = singles.length ? pack.count : 0
    // Bolsas linked to a course are components of it, but they also belong to "Bolsas e Incentivos".
    if (m.id === "bolsas") {
      const shownParents = new Set(actions.map((a) => a.item.id))
      const linked = o.items.filter((i) => i.kind === "bolsa" && i.parentId && shownParents.has(i.parentId) && vis(i.projectId)).sort((a, b) => a.range.start - b.range.start)
      if (linked.length) {
        const lp = packPreferred(linked.map((i) => ({ start: i.range.start, end: i.range.end, pref: i.modLane != null ? i.modLane - laneCount : undefined })))
        linked.forEach((it, k) => members.push({ item: it, lane: laneCount + lp.lanes[k] }))
        laneCount += lp.count
      }
    }
    for (const a of list.filter((x) => x.members)) {
      const sub = packPreferred(a.members!.map((i) => ({ start: i.range.start, end: i.range.end })))
      a.members!.forEach((it, k) => members.push({ item: it, lane: laneCount + sub.lanes[k], info: k === 0 ? a.info : undefined, toggle: k === 0 ? a.key : undefined, expanded: o.expanded.includes(a.key), stamp: k === 0 ? stampTag(financeStamp(a.item, a.info.acq, short)) : undefined }))
      laneCount += sub.count
    }
    laneRow("modality", m.label, members, laneCount, {
      modality: m.id,
      collapsed,
      sub: members.length ? `${new Set(members.map((x) => x.toggle ?? x.item.id)).size} ${members.length === 1 ? "registro" : "registros"}` : undefined,
      empty: members.length ? undefined : "Nenhuma edição cadastrada",
    })
    if (collapsed) continue
    // Components of expanded actions, right under their modality.
    for (const a of list.filter((x) => o.expanded.includes(x.key))) pushComponents(a, push, () => y, itemRows, rowOfMap, o, zebra - 1)
  }
  return {
    rows,
    total: y + 10,
    rowOf: (id) => rowOfMap.get(id) ?? (rows.find((r) => r.type === "item" && r.item.id === id && !r.virtual) as ItemRow | undefined),
    orderOf: () => [],
    itemRows: [...itemRows, ...rows.filter((r): r is ItemRow => r.type === "item")],
    dropAt: (yy) => {
      const r = rows.find((x): x is Extract<Row, { type: "lane" }> => x.type === "lane" && x.kind === "modality" && !x.collapsed && yy >= x.top && yy < x.top + x.h)
      if (!r || !r.modality) return null
      const lane = Math.max(0, Math.min(r.laneCount, Math.floor((yy - r.top - PAD) / LANE_H)))
      return { group: "g2", index: lane, lineY: r.top + PAD + lane * LANE_H, modality: r.modality }
    },
    stats,
  }
}

function pushComponents(
  a: ResolvedAction,
  push: (r: Row) => void,
  y: () => number,
  itemRows: ItemRow[],
  rowOfMap: Map<string, ItemRow>,
  o: ModOptions,
  index: number,
) {
  const label = a.cons?.name ?? a.item.shortName ?? a.item.name
  const fins = a.info.fins
  let first = true
  const comp = (k: CompKind, list: FinRecord[], empty?: string) => {
    push({ type: "comp", group: "g3", top: y(), h: COMP_H, comp: k, actionId: a.item.id, action: a.item, fins: list, empty: list.length ? undefined : empty, index, depth: 2, prefix: first ? label : undefined })
    first = false
  }
  const thin = (it: EffItem) => {
    const ir: ItemRow = { type: "item", group: "g3", top: y(), h: COMP_H, item: it, index, depth: 2, thin: true }
    push(ir)
    itemRows.push(ir)
    if (!rowOfMap.has(it.id)) rowOfMap.set(it.id, ir)
  }
  if (a.members) {
    for (const m of a.members) thin(m)
    if (fins.length) comp("aquisicao", fins)
    return
  }
  const course = a.item.kind === "curso"
  const children = o.items.filter((i) => i.parentId === a.item.id && (!i.projectId || !o.hiddenProjects.includes(i.projectId))).sort((x, z) => x.range.start - z.range.start)
  const aq = fins.filter((f) => f.kind === "aquisicao" || f.kind === "pagamento")
  if (course || aq.length) comp("aquisicao", aq, "Nenhuma aquisição ou pagamento cadastrado")
  const bolsas = children.filter((c) => c.kind === "bolsa")
  if (bolsas.length) bolsas.forEach(thin)
  else if (course) comp("bolsas", [], "Nenhuma bolsa vinculada")
  const nfs = fins.filter((f) => f.kind === "nf")
  if (course || nfs.length) comp("nf", nfs, "Nenhuma nota fiscal cadastrada")
  const mats = fins.filter((f) => f.kind === "material")
  if (course || mats.length) comp("materiais", mats, "Nenhum material cadastrado")
  const servs = fins.filter((f) => f.kind === "servico")
  if (servs.length) comp("servicos", servs)
  children.filter((x) => x.kind !== "bolsa").forEach(thin)
  if (!course && !fins.length && !children.length)
    push({ type: "note", group: "g2", top: y(), h: NOTE_H, text: `${label}: nenhum componente cadastrado — registre aquisição, NF ou materiais na aba Dados.`, tone: "muted", depth: 2, index })
}
