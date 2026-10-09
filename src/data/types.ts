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
  /** Short label for bars, e.g. "Técnico 1". The full `name` stays in the panel and tooltip. */
  shortName?: string
  /** Offerings (curso items): catalogue course they are an edition of. */
  courseId?: string | null
  /** Turmas this record serves: an offering's turmas, or the beneficiaries of a bolsa. */
  turmaIds?: string[]
  /** Visual consolidation: records sharing a key are drawn on one row (no administrative merge). */
  consolidation?: string | null
  /** Partner / supplier — administrative detail, never shown on the main timeline. */
  partner?: string
  /** Financial situation, independent from the temporal situation. */
  finSituation?: FinSituation
  /** Documented revisions of this record (date changes backed by evidence). */
  revisions?: Revision[]
  /** V8 — explicit participation of other projects in this action (never inferred). */
  funding?: Funding[]
  /** V11 — modality row of the main timeline (classification for reading, not evidence). */
  modality?: ModalityId
  /** V11 — preferred sub-lane inside its modality (vertical arrangement only). */
  modLane?: number
  /** V11 — appearance of the block. Never touches dates, status or values. */
  style?: BlockStyle
  /** V11 — Projeto 3 proposal this planned record comes from. */
  ideaId?: string | null
}

export type ModalityId = "jornada" | "robotica" | "tecnico" | "bolsas" | "operacao" | "outras"

export const MODALITIES: { id: ModalityId; label: string; hint: string }[] = [
  { id: "jornada", label: "Jornada Tecnológica", hint: "Edições da Jornada" },
  { id: "robotica", label: "Robótica", hint: "Turmas e ofertas de Robótica" },
  { id: "tecnico", label: "Cursos Técnicos", hint: "Técnico Piloto, Técnico 1, Técnico 2 e ofertas futuras" },
  { id: "bolsas", label: "Bolsas e Incentivos", hint: "Bolsas dos cursos, Bolsas de Inglês e outros incentivos" },
  { id: "operacao", label: "Operação e Infraestrutura", hint: "Equipe, escritório, infraestrutura, contratos" },
  { id: "outras", label: "Outras ações", hint: "Ações ainda sem modalidade definida" },
]

/** Modality of a record: the explicit one, or a reading of its kind and name. */
export function modalityOf(it: { modality?: ModalityId; kind: ItemKind; name: string; shortName?: string }): ModalityId {
  if (it.modality) return it.modality
  const n = `${it.shortName ?? ""} ${it.name}`.toLowerCase()
  if (it.kind === "bolsa") return "bolsas"
  if (it.kind === "operacao" || it.kind === "contrato") return "operacao"
  if (n.includes("jornada")) return "jornada"
  if (n.includes("robótica") || n.includes("robotica")) return "robotica"
  if (it.kind === "curso" || n.includes("técnic") || n.includes("tecnic")) return "tecnico"
  if (n.includes("infraestrutura") || n.includes("escritório") || n.includes("equipe")) return "operacao"
  return "outras"
}

export interface BlockStyle {
  font?: "inter" | "display" | "mono" | "serif"
  size?: number
  weight?: number
  textColor?: string
  fill?: string
  stroke?: string
  strokeWidth?: number
  radius?: number
  opacity?: number
  preset?: string
}

/* ── V11 — Projeto 3: strategic planning ─────────────────────────────────────── */

export type PillarId = "formacao" | "talentos" | "infraestrutura" | "ia" | "transversal"

export const PILLARS: { id: PillarId; n: string; label: string; color: string }[] = [
  { id: "formacao", n: "1", label: "Formação e Continuidade", color: "#19885D" },
  { id: "talentos", n: "2", label: "Talentos e Oportunidades", color: "#127BAF" },
  { id: "infraestrutura", n: "3", label: "Infraestrutura e Expansão", color: "#B26A1E" },
  { id: "ia", n: "4", label: "IA, Pesquisa e Inovação", color: "#8870B5" },
  { id: "transversal", n: "T", label: "Sustentabilidade, custos, governança e prestação de contas", color: "#475569" },
]

export type IdeaStatus = "ideia" | "em_analise" | "priorizada" | "validada" | "nao_priorizada"

export const IDEA_STATUS_LABEL: Record<IdeaStatus, string> = {
  ideia: "Ideia",
  em_analise: "Em análise",
  priorizada: "Priorizada",
  validada: "Validada internamente",
  nao_priorizada: "Não priorizada",
}

export type Priority = "alta" | "media" | "baixa"

export interface Idea {
  id: string
  name: string
  description?: string
  pillar: PillarId
  priority: Priority | null
  status: IdeaStatus
  owner?: string
  start?: ISODate | null
  end?: ISODate | null
  /** Only when estimated; `null` = não estimado. */
  cost?: number | null
  dependencies?: string
  source?: string
  notes?: string
  order: number
  /** Planned record created from it in the Projeto 3 scenario. */
  linkedItemId?: string | null
}

export type MilestoneStatus = "a_confirmar" | "previsto" | "realizado" | "adiado" | "cancelado"

export const MILESTONE_LABEL: Record<MilestoneStatus, string> = {
  a_confirmar: "A confirmar",
  previsto: "Previsto",
  realizado: "Realizado",
  adiado: "Adiado",
  cancelado: "Cancelado",
}

/** A dated reference. Reaching the date never completes it: only an explicit update does. */
export interface StrategyMilestone {
  id: string
  title: string
  date: ISODate | null
  dateEnd?: ISODate | null
  status: MilestoneStatus
  owner?: string
  notes?: string
  sourceId?: string
}

export interface StrategyTask {
  id: string
  kind: "prioridade" | "pendencia" | "proxima_acao"
  text: string
  owner?: string
  due?: ISODate | null
  done: boolean
}

export interface Strategy {
  /** Editable premise, subject to the applicable legislation. */
  premiseYears: number
  premiseNote: string
  /** What the minutes record — not a decision taken by the system. */
  encaminhamento: string
  encaminhamentoSourceId?: string
  leadershipValidation: { status: "pendente" | "documentada"; note: string; date?: ISODate | null }
  meeting: { title: string; date: ISODate | null; participants: string; status: MilestoneStatus; notes: string }
  milestones: StrategyMilestone[]
  tasks: StrategyTask[]
  ideas: Idea[]
  pillarNotes: Partial<Record<PillarId, string>>
  /** Scenario that receives planned records from validated ideas. */
  scenarioId: string
}

/** A project that funds part of an action. The action keeps its responsible `projectId`. */
export interface Funding {
  projectId: string
  /** Parcela ou componente financiado, as written in the source (free text). */
  share?: string
  instrument?: string
  start?: ISODate | null
  end?: ISODate | null
  note?: string
}

/* ── V8 — financial and documentary components of an action ─────────────────── */

export type FinKind = "aquisicao" | "pagamento" | "nf" | "parcela" | "material" | "servico"

export const FIN_KIND_LABEL: Record<FinKind, string> = {
  aquisicao: "Aquisição / contratação",
  pagamento: "Pagamento",
  nf: "Nota fiscal",
  parcela: "Parcela de bolsa",
  material: "Material / recurso",
  servico: "Serviço complementar",
}

/** Financial state of an acquisition — distinct from its documentary proof. */
export type AcqStatus = "planejado" | "em_negociacao" | "contratado" | "parcialmente_pago" | "integralmente_pago"

export const ACQ_STATUS_LABEL: Record<AcqStatus, string> = {
  planejado: "Planejado",
  em_negociacao: "Em negociação",
  contratado: "Contratado",
  parcialmente_pago: "Parcialmente pago",
  integralmente_pago: "Integralmente pago",
}

export type ProofStatus = "pendente" | "comprovado"

export const PROOF_LABEL: Record<ProofStatus, string> = { pendente: "Comprovação pendente", comprovado: "Comprovado" }

/** Bolsa installments: due depends on attendance and performance — never presumed. */
export type ParcelStatus = "prevista" | "devida" | "paga" | "pendente"

export const PARCEL_LABEL: Record<ParcelStatus, string> = {
  prevista: "Prevista",
  devida: "Devida conforme critérios",
  paga: "Paga",
  pendente: "Pendente",
}

export type AcqStepId = "planejamento" | "negociacao" | "proposta" | "contrato" | "nf" | "pagamento" | "comprovacao"

export const ACQ_STEPS: { id: AcqStepId; label: string }[] = [
  { id: "planejamento", label: "Planejamento" },
  { id: "negociacao", label: "Negociação" },
  { id: "proposta", label: "Proposta recebida" },
  { id: "contrato", label: "Contrato formalizado" },
  { id: "nf", label: "Nota fiscal emitida" },
  { id: "pagamento", label: "Pagamento realizado" },
  { id: "comprovacao", label: "Comprovação registrada" },
]

/** Each step carries its own date and evidence; completing one never completes another. */
export interface AcqStep {
  id: AcqStepId
  done: boolean
  date?: ISODate | null
  evidence?: string
}

export type MaterialType = "pedagogico" | "kit" | "equipamento" | "licenca" | "outro"

export const MATERIAL_LABEL: Record<MaterialType, string> = {
  pedagogico: "Material pedagógico",
  kit: "Kit",
  equipamento: "Equipamento",
  licenca: "Licença",
  outro: "Outro recurso",
}

/**
 * One financial or documentary record. Shown under its action (and in any filter), but always a
 * single record: totals are computed by id, never per view.
 */
export interface FinRecord {
  id: string
  kind: FinKind
  name: string
  /** Action (curso, atividade, bolsa…) it belongs to. `null` = vínculo a validar. */
  actionId: string | null
  /** Payments and NFs may point to their acquisition. */
  parentId?: string | null
  /** Event date (start = end) or period. `null` = não informada. */
  start: ISODate | null
  end: ISODate | null
  /** Only a window is known (e.g. "within the vigência"): drawn as a dashed interval, never a point. */
  dateUndetermined?: boolean
  /** True only when a record of the event exists (NF issued, payment made, material received). */
  realized: boolean
  /** `null` = não informado, never zero. */
  value: number | null
  fundingProjectId: string | null
  instrument?: string
  proof: ProofStatus
  /** "a_validar" when the link to the action is not unequivocal. */
  linkStatus: "confirmado" | "a_validar"
  supplier?: string
  docNumber?: string
  /** Competência "YYYY-MM". */
  competencia?: string
  contractRef?: string
  evidence?: string
  sourceIds: string[]
  notes?: string
  /** Shown only in this scenario (a forecast that exists only in the simulation). */
  scenarioId?: string | null
  // aquisição
  acqStatus?: AcqStatus
  contractDate?: ISODate | null
  contractValue?: number | null
  steps?: AcqStep[]
  // parcela de bolsa
  parcelStatus?: ParcelStatus
  beneficiaries?: number | null
  // material
  materialType?: MaterialType
}

export type FinSituation =
  | "cobertura_documentada"
  | "pagamento_antecipado"
  | "compromisso_previsto"
  | "pagamentos_condicionados"
  | "nao_identificada"
  | "pendente"

export const FIN_LABEL: Record<FinSituation, string> = {
  cobertura_documentada: "Cobertura documentada",
  pagamento_antecipado: "Pagamento antecipado documentado",
  compromisso_previsto: "Compromisso previsto",
  pagamentos_condicionados: "Pagamentos futuros condicionados",
  nao_identificada: "Cobertura não identificada",
  pendente: "Situação pendente de validação",
}

export interface Revision {
  at: ISODate
  field: "start" | "end"
  from: ISODate
  to: ISODate
  sourceId?: string
  note: string
}

/** Catalogue course (e.g. a technical course). Distinct from its editions (offerings). */
export interface Course {
  id: string
  name: string
  notes?: string
}

/** A class of students. An offering may have one or more turmas. */
export interface Turma {
  id: string
  name: string
  entryYear: number
  start: ISODate
  end: ISODate
  courseId: string | null
  /** Offering (curso item) the turma attends. */
  offeringId: string | null
  projectId: string | null
  /** Only when documented; `null` = não informado. */
  students: number | null
  studentsCertainty?: Certainty
  stage: "jornada" | "robotica" | "tecnico" | "graduacao" | "outra"
  status: Certainty
  sourceIds: string[]
  notes?: string
  generationId?: string | null
}

/** Group of students followed across stages, only when the link is documented. */
export interface Generation {
  id: string
  name: string
  /** Year the generation attends the 9º ano. */
  cohortYear: number
  notes?: string
}

export interface Consolidation {
  id: string
  name: string
  subtitle?: string
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
  /** Data-model version applied by `normalizeDoc`. */
  modelVersion?: number
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
  courses?: Course[]
  turmas?: Turma[]
  generations?: Generation[]
  consolidations?: Consolidation[]
  /** V8 — financial / documentary components, linked to actions. */
  finRecords?: FinRecord[]
  /** V11 — Projeto 3 strategic planning. */
  strategy?: Strategy
  presentation: {
    layout: Record<string, BoxLayout>
    notes: SceneNote[]
    highlightCourseIds: string[]
  }
}
