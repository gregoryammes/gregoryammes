import type { ISODate, Precision } from "@/lib/dates"

/**
 * Evidence level of a record. The interface never upgrades a record on its own:
 * a simulated change is always `hipotese`, whatever the record it overrides.
 */
export type Certainty =
  | "comprovado"
  | "executado"
  | "formalizado"
  | "planejado"
  | "a_validar"
  | "nao_confirmado"
  | "nao_informado"
  | "hipotese"

export const CERTAINTY_LABEL: Record<Certainty, string> = {
  comprovado: "Comprovado",
  executado: "Executado",
  formalizado: "Formalizado",
  planejado: "Planejado",
  a_validar: "A validar",
  nao_confirmado: "Não confirmado",
  nao_informado: "Não informado",
  hipotese: "Hipótese",
}

/** The seven visual layers of the canvas. */
export type LayerId = "projetos" | "planejamento" | "vigencias" | "formacao" | "bolsas" | "operacao" | "cenarios"

export const LAYERS: { id: LayerId; label: string; hint: string }[] = [
  { id: "projetos", label: "Projetos", hint: "Ciclos do SKA Tech Hub" },
  { id: "planejamento", label: "Planejamento", hint: "Cronogramas originais" },
  { id: "vigencias", label: "Vigências", hint: "Períodos formalmente registrados" },
  { id: "formacao", label: "Formação", hint: "Cursos, turmas e atividades" },
  { id: "bolsas", label: "Bolsas", hint: "Incentivos estudantis" },
  { id: "operacao", label: "Operação", hint: "Equipe, estrutura, contratos" },
  { id: "cenarios", label: "Cenários", hint: "Propostas e simulações" },
]

/**
 * The four reading groups of the timeline (rows), each gathering one or more storage layers.
 * `cenarios` is a legacy layer: its records are placed in a group by kind.
 */
export type GroupId = "g1" | "g2" | "g3" | "g4"

export const GROUPS: { id: GroupId; code: string; label: string; layers: LayerId[] }[] = [
  { id: "g1", code: "01", label: "Planejamento e vigência", layers: ["projetos", "planejamento", "vigencias"] },
  { id: "g2", code: "02", label: "Execução educacional", layers: ["formacao"] },
  { id: "g3", code: "03", label: "Bolsas e compromissos", layers: ["bolsas"] },
  { id: "g4", code: "04", label: "Suporte operacional", layers: ["operacao"] },
]

export function groupOf(it: { layer: LayerId; kind: ItemKind }): GroupId {
  const g = GROUPS.find((x) => x.layers.includes(it.layer))
  if (g) return g.id
  if (it.kind === "bolsa") return "g3"
  if (it.kind === "operacao" || it.kind === "contrato") return "g4"
  if (it.kind === "projeto" || it.kind === "planejamento" || it.kind === "vigencia" || it.kind === "marco") return "g1"
  return "g2"
}

/** Storage layer an item takes when it is moved into a group. */
export function layerFor(kind: ItemKind, g: GroupId): LayerId {
  if (g === "g1") return kind === "projeto" ? "projetos" : kind === "vigencia" || kind === "marco" ? "vigencias" : "planejamento"
  return g === "g2" ? "formacao" : g === "g3" ? "bolsas" : "operacao"
}

const DETAIL_KINDS: ItemKind[] = ["turma", "atividade", "contrato", "marco", "operacao"]
/** Level-2 records: hidden in the clean view until their group is detailed. */
export const isDetail = (it: { kind: ItemKind; detail?: boolean }) => it.detail ?? DETAIL_KINDS.includes(it.kind)

export type ItemKind =
  | "projeto"
  | "planejamento"
  | "vigencia"
  | "curso"
  | "turma"
  | "bolsa"
  | "atividade"
  | "contrato"
  | "operacao"
  | "marco"

export const KIND_LABEL: Record<ItemKind, string> = {
  projeto: "Projeto",
  planejamento: "Planejamento",
  vigencia: "Vigência / instrumento",
  curso: "Curso",
  turma: "Turma",
  bolsa: "Bolsa",
  atividade: "Atividade",
  contrato: "Contrato",
  operacao: "Operação",
  marco: "Marco",
}

export const DEFAULT_LAYER: Record<ItemKind, LayerId> = {
  projeto: "projetos",
  planejamento: "planejamento",
  vigencia: "vigencias",
  curso: "formacao",
  turma: "formacao",
  bolsa: "bolsas",
  atividade: "formacao",
  contrato: "operacao",
  operacao: "operacao",
  marco: "vigencias",
}

export interface Finance {
  /** Only when documented. `null` means "não informado" — never zero. */
  planned: number | null
  /** Only when proven. `null` means "não informado". */
  paid: number | null
  status: Certainty
  note?: string
}

export interface Item {
  id: string
  name: string
  kind: ItemKind
  layer: LayerId
  /** Row inside its layer. Changing it never changes dates or finance links. */
  lane: number
  projectId: string | null
  start: ISODate
  /** Inclusive. Equal to `start` for a milestone. */
  end: ISODate
  /** How precisely the source pins the dates; drives formatting. */
  precision: Precision
  /** Dates known only to fall somewhere inside the range (e.g. P1 actions without a dated source). */
  dateUndetermined?: boolean
  /** Execution / evidence status of the period itself. */
  certainty: Certainty
  contractStatus?: Certainty
  finance?: Finance
  /** Course this record belongs to (bolsas → curso). */
  parentId?: string | null
  /** Quantidade de alunos — only when proven. */
  students?: number | null
  conditions?: string
  description?: string
  notes?: string
  sourceIds: string[]
  color?: string
  locked?: boolean
  hidden?: boolean
  /** Shown only when its group is in detailed view. Defaults by kind (see `isDetail`). */
  detail?: boolean
}

export interface Project {
  id: string
  name: string
  short: string
  phase: string
  color: string
  description: string
}

export interface Source {
  id: string
  title: string
  kind: "documento" | "historico" | "material_anterior" | "informado" | "simulacao"
  status: Certainty
  note?: string
}

export interface Scenario {
  id: string
  name: string
  kind: "baseline" | "working" | "alternative"
  description: string
  /** Field-level patches over baseline items. */
  overrides: Record<string, Partial<Item>>
  added: Item[]
  removed: string[]
}

export type AnnotationKind = "note" | "callout" | "highlight" | "marker" | "comment"

export interface Annotation {
  id: string
  kind: AnnotationKind
  text: string
  /** Free annotations live at a date + a vertical offset in px from the top of the rows. */
  date: ISODate
  y: number
  /** When linked, the annotation follows the item: `date` is ignored and `offsetDays` is applied to the item start. */
  linkedItemId?: string | null
  offsetDays?: number
  color?: string
  width?: number
}

export interface Link {
  id: string
  from: string
  to: string
  label?: string
}

export interface Decision {
  id: string
  title: string
  topic: "curso" | "bolsas" | "operacao" | "projeto3" | "administrativo"
  description: string
  status: "pendente" | "em_analise" | "decidido"
  relatedItemIds: string[]
}

/** Presentation composition — never mixed with temporal data. */
export interface BoxLayout {
  x: number
  y: number
  w?: number
  scale?: number
  hidden?: boolean
  color?: string
}

export interface SceneNote {
  id: string
  scene: number
  text: string
  x: number
  y: number
  /** Optional link to a course: in Scene 3 the note is pinned to the item's end date. */
  linkedItemId?: string | null
  arrow?: boolean
  color?: string
}

export interface Settings {
  /** "Data de referência" shown as a vertical marker. Editable. */
  referenceDate: ISODate
  snap: "none" | "day" | "week" | "month" | "quarter"
  layersHidden: LayerId[]
  layersCollapsed: LayerId[]
  boardRange: { start: number; end: number }
  cohortStartYear: number
  layout?: "groups-v2"
  groupsHidden?: GroupId[]
  groupsCollapsed?: GroupId[]
  groupsDetailed?: GroupId[]
  /** Journey matrix: first and last cohort (year the cohort is in 9º ano). */
  journeyCohorts?: { from: number; to: number }
}

export interface StudioDoc {
  schema: "ska-temporal-studio/1"
  meta: { name: string; updatedAt: string; savedAt?: string }
  settings: Settings
  projects: Project[]
  items: Item[]
  scenarios: Scenario[]
  annotations: Annotation[]
  links: Link[]
  sources: Source[]
  decisions: Decision[]
  presentation: {
    layout: Record<string, BoxLayout>
    notes: SceneNote[]
    highlightCourseIds: string[]
  }
}
