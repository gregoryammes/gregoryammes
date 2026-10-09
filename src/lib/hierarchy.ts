import type { EffItem } from "./analysis"
import { actionInfo, isSettled, matchesFinFilter, type ActionInfo, type FinFilter } from "./finance"
import { COMP_H, NOTE_H, PROJECT_H, ROW_H, finish, packLanes, SUB_H, type CompKind, type Row, type RowLayout } from "./layout"
import { groupOf, type Consolidation, type FinRecord, type GroupId, type ItemKind, type StudioDoc } from "@/data/types"

/* ──────────────────────────────────────────────────────────────────────────────
 * V8 — hierarchical timeline: Projeto → Ação → Componentes.
 * The hierarchy only decides where a record is drawn. A record appears once; a
 * financial record is never copied into a second row.
 * ────────────────────────────────────────────────────────────────────────────── */

export type Level = 2 | 3

export interface HierOptions {
  doc: StudioDoc
  /** Effective items, already filtered by record visibility and the turma filter. */
  items: EffItem[]
  fins: FinRecord[]
  ref: number
  level: Level
  /** Level 2: actions expanded by the user. */
  expanded: string[]
  /** Level 3: actions collapsed by the user. */
  collapsed: string[]
  collapsedProjects: string[]
  hiddenProjects: string[]
  /** Projects whose ended-and-paid actions are hidden (open commitments stay). */
  hideSettled: string[]
  finFilter: FinFilter
  consolidations?: Consolidation[]
}

export interface HierStats {
  /** Actions hidden because they ended, are paid and nothing is open. */
  settledHidden: Record<string, number>
  /** Ended and paid, but kept visible because something is still open. */
  settledKeptOpen: Record<string, string[]>
  /** Actions filtered out by the financial filter. */
  finHidden: number
}

const ACTION_KINDS: ItemKind[] = ["curso", "atividade", "operacao", "contrato", "turma", "bolsa"]
const KIND_RANK: Partial<Record<ItemKind, number>> = { curso: 0, atividade: 1, turma: 2, bolsa: 3, operacao: 4, contrato: 5 }

export interface ResolvedAction {
  key: string
  /** Main record (for a consolidated programme: its first member). */
  item: EffItem
  members?: EffItem[]
  cons?: Consolidation
  info: ActionInfo
  home: string | null
  via?: string
}

const visible = (hidden: string[]) => (pid: string | null | undefined) => !pid || !hidden.includes(pid)

export type ResolveOptions = Pick<HierOptions, "doc" | "items" | "fins" | "ref" | "hiddenProjects" | "hideSettled" | "finFilter" | "consolidations">

/**
 * Actions visible under the current filters: project visibility (with explicit participation of
 * another project), "concluídas e pagas" and the financial filter. Shared by every layout.
 */
export function resolveActions(o: ResolveOptions): { actions: ResolvedAction[]; stats: HierStats } {
  const vis = visible(o.hiddenProjects)
  const byId = new Map(o.items.map((i) => [i.id, i]))
  const cons = new Map((o.consolidations ?? []).map((c) => [c.id, c]))
  const projName = (pid: string | null) => o.doc.projects.find((p) => p.id === pid)?.short ?? pid ?? "—"
  const isChild = (i: EffItem) => !!i.parentId && byId.has(i.parentId) && i.parentId !== i.id
  const finVisible = (f: FinRecord, actionProject: string | null) => vis(f.fundingProjectId ?? actionProject)

  // ── Actions (and consolidated programmes) ────────────────────────────────
  const raw: { key: string; item: EffItem; members?: EffItem[]; cons?: Consolidation }[] = []
  const placedCons = new Set<string>()
  for (const it of o.items) {
    if (!ACTION_KINDS.includes(it.kind) || isChild(it)) continue
    if (it.consolidation && cons.has(it.consolidation)) {
      if (placedCons.has(it.consolidation)) continue
      placedCons.add(it.consolidation)
      const members = o.items.filter((m) => m.consolidation === it.consolidation && !isChild(m)).sort((a, b) => a.range.start - b.range.start)
      raw.push({ key: `cons:${it.consolidation}`, item: members[0], members, cons: cons.get(it.consolidation) })
      continue
    }
    raw.push({ key: it.id, item: it })
  }

  const stats: HierStats = { settledHidden: {}, settledKeptOpen: {}, finHidden: 0 }
  const actions: ResolvedAction[] = []
  for (const r of raw) {
    const members = r.members ?? [r.item]
    const pid = r.item.projectId
    const fundFins = members.flatMap((m) => o.fins.filter((f) => f.actionId === m.id))
    const partners = [...new Set([...(members.flatMap((m) => m.funding ?? []).map((f) => f.projectId)), ...fundFins.map((f) => f.fundingProjectId).filter((x): x is string => !!x)])]
    // An action stays visible while any project taking part in it is visible.
    const home = vis(pid) ? pid : (partners.find((p) => p !== pid && vis(p)) ?? undefined)
    if (pid && home === undefined) continue
    const shownFins = fundFins.filter((f) => finVisible(f, pid))
    const info = actionInfo(r.item, o.items, shownFins, o.ref)
    if (r.members) {
      info.bolsas = members
      info.fins = shownFins
      info.tags.splice(0, 0, { label: `${members.length} ${members.length === 1 ? "ciclo" : "ciclos"}`, tone: "neutral" })
    }
    if (pid && o.hideSettled.includes(pid) && info.ended && info.paid) {
      if (isSettled(info)) {
        stats.settledHidden[pid] = (stats.settledHidden[pid] ?? 0) + 1
        continue
      }
      ;(stats.settledKeptOpen[pid] ??= []).push(info.open.join(", "))
    }
    if (!matchesFinFilter(info, o.finFilter, o.ref)) {
      stats.finHidden++
      continue
    }
    actions.push({
      key: r.key,
      item: r.item,
      members: r.members,
      cons: r.cons,
      info,
      home: home ?? null,
      via: home && home !== pid ? `participação do ${projName(home)} · resp. ${projName(pid)}` : undefined,
    })
  }
  return { actions, stats }
}

export function computeHierarchy(o: HierOptions): RowLayout & { stats: HierStats } {
  const vis = visible(o.hiddenProjects)
  const byId = new Map(o.items.map((i) => [i.id, i]))
  const isChild = (i: EffItem) => !!i.parentId && byId.has(i.parentId) && i.parentId !== i.id
  const { actions, stats } = resolveActions(o)
  const rank = (a: ResolvedAction) => (a.cons ? 3 : (KIND_RANK[a.item.kind] ?? 9))
  actions.sort((a, b) => rank(a) - rank(b) || a.item.range.start - b.item.range.start || a.item.name.localeCompare(b.item.name))

  // ── Rows ─────────────────────────────────────────────────────────────────
  const rows: Row[] = []
  let y = 0
  let zebra = 0
  const isExpanded = (key: string) => (o.level === 3 ? !o.collapsed.includes(key) : o.expanded.includes(key))
  const push = (r: Row) => {
    rows.push(r)
    y += r.h
  }

  const sections: (string | null)[] = [...o.doc.projects.map((p) => p.id), null]
  for (const pid of sections) {
    const own = actions.filter((a) => a.home === pid)
    const cycle = pid ? o.items.find((i) => i.kind === "projeto" && i.projectId === pid) : undefined
    if (pid && !vis(pid)) continue
    if (!pid && own.length === 0) continue
    const projRows = pid ? o.items.filter((i) => i.projectId === pid && !isChild(i) && (i.kind === "vigencia" || i.kind === "planejamento" || i.kind === "marco")) : []
    const collapsed = !!pid && o.collapsedProjects.includes(pid)
    const g: GroupId = "g1"
    push({ type: "project", group: g, top: y, h: PROJECT_H, projectId: pid, item: cycle, collapsed, count: own.length, index: zebra++ })
    if (collapsed) {
      y += 6
      continue
    }
    // Project-level references: the vigência always; planning and milestones in detail.
    for (const v of projRows.filter((i) => i.kind === "vigencia")) {
      push({ type: "item", group: "g1", top: y, h: ROW_H, item: v, index: zebra++, depth: 1 })
      if (v.baseRange) push({ type: "item", group: "g1", top: y, h: ROW_H, item: v, index: zebra - 1, depth: 1, virtual: "hyp" })
    }
    if (o.level === 3)
      for (const p of projRows.filter((i) => i.kind !== "vigencia").sort((a, b) => a.range.start - b.range.start))
        push({ type: "item", group: groupOf(p), top: y, h: COMP_H, item: p, index: zebra++, depth: 1, thin: true })

    for (const a of own) {
      const exp = isExpanded(a.key)
      const index = zebra++
      if (a.members) {
        const { lanes, count } = packLanes(a.members)
        const h = Math.max(ROW_H, 12 + count * (SUB_H + 3))
        push({ type: "consolidated", group: groupOf(a.item), top: y, h, key: a.cons!.id, name: a.cons!.name, subtitle: a.cons!.subtitle, members: a.members, lanes, laneCount: count, index, depth: 1, toggle: a.key, expanded: exp, info: a.info, via: a.via })
        if (exp) {
          for (const m of a.members) push({ type: "item", group: groupOf(m), top: y, h: COMP_H, item: m, index, depth: 2, thin: true })
          const mf = a.info.fins
          if (mf.length) push({ type: "comp", group: "g3", top: y, h: COMP_H, comp: "aquisicao", actionId: a.item.id, fins: mf, index, depth: 2 })
        }
        continue
      }
      push({ type: "item", group: groupOf(a.item), top: y, h: ROW_H, item: a.item, index, depth: 1, toggle: a.key, expanded: exp, info: a.info, via: a.via })
      if (!exp) continue
      const fins = a.info.fins
      const comp = (k: CompKind, list: FinRecord[], empty?: string) =>
        push({ type: "comp", group: "g3", top: y, h: COMP_H, comp: k, actionId: a.item.id, action: a.item, fins: list, empty: list.length ? undefined : empty, index, depth: 2 })
      const children = o.items.filter((i) => i.parentId === a.item.id && vis(i.projectId ?? a.item.projectId)).sort((x, z) => x.range.start - z.range.start)
      const course = a.item.kind === "curso"
      const aq = fins.filter((f) => f.kind === "aquisicao" || f.kind === "pagamento")
      if (course || aq.length) comp("aquisicao", aq, "Nenhuma aquisição ou pagamento cadastrado")
      const bolsas = children.filter((c) => c.kind === "bolsa")
      if (bolsas.length) for (const b of bolsas) push({ type: "item", group: groupOf(b), top: y, h: COMP_H, item: b, index, depth: 2, thin: true })
      else if (course) comp("bolsas", [], "Nenhuma bolsa vinculada")
      const nfs = fins.filter((f) => f.kind === "nf")
      if (course || nfs.length) comp("nf", nfs, "Nenhuma nota fiscal cadastrada")
      const mats = fins.filter((f) => f.kind === "material")
      if (course || mats.length) comp("materiais", mats, "Nenhum material cadastrado")
      const servs = fins.filter((f) => f.kind === "servico")
      if (servs.length) comp("servicos", servs)
      for (const c of children.filter((x) => x.kind !== "bolsa")) push({ type: "item", group: groupOf(c), top: y, h: COMP_H, item: c, index, depth: 2, thin: true })
      if (!course && !fins.length && !children.length) push({ type: "note", group: "g2", top: y, h: NOTE_H, text: "Nenhum componente cadastrado — use o painel da ação para registrar aquisição, NF ou materiais.", tone: "muted", depth: 2, index })
    }
    // Records whose link to an action is not unequivocal stay visible, flagged.
    const loose = o.fins.filter((f) => (!f.actionId || !byId.has(f.actionId)) && (f.fundingProjectId ?? null) === pid)
    if (loose.length) push({ type: "comp", group: "g3", top: y, h: COMP_H, comp: "sem_vinculo", actionId: null, fins: loose, index: zebra++, depth: 1 })
    if (pid && own.length === 0)
      push({ type: "note", group: "g2", top: y, h: NOTE_H, text: cycle?.certainty === "hipotese" ? "Nenhuma ação proposta cadastrada. Propostas futuras ficam como hipótese até validação." : "Nenhuma ação visível com os filtros atuais.", tone: "muted", depth: 1, index: zebra++ })
    if (pid && stats.settledHidden[pid])
      push({ type: "note", group: "g2", top: y, h: NOTE_H, text: `${stats.settledHidden[pid]} ação(ões) concluída(s) e paga(s) oculta(s) — nada foi excluído.`, tone: "muted", depth: 1, index: zebra++ })
    if (pid && stats.settledKeptOpen[pid]?.length)
      push({ type: "note", group: "g2", top: y, h: NOTE_H, text: `${stats.settledKeptOpen[pid].length} ação(ões) concluída(s) e paga(s) mantida(s): compromissos abertos.`, tone: "warn", depth: 1, index: zebra++ })
    y += 8
  }
  return { ...finish(rows, y, new Map(), false), stats }
}
