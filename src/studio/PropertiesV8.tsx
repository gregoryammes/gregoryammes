import { useEffect, useState } from "react"
import { AlertTriangle, Plus, Trash2 } from "lucide-react"
import { Button, Chip } from "@/components/ui/button"
import { confirmAction } from "@/components/Confirm"
import { fmtDate, isValidISO, toDay } from "@/lib/dates"
import type { EffItem } from "@/lib/analysis"
import { acqOf, acqWarnings, actionInfo, finOf, finRecordsIn, paidOf, type Tag } from "@/lib/finance"
import { brl } from "@/lib/visual"
import {
  ACQ_STATUS_LABEL, ACQ_STEPS, CERTAINTY_LABEL, FIN_KIND_LABEL, MATERIAL_LABEL, PARCEL_LABEL, PROOF_LABEL,
  type AcqStatus, type FinKind, type FinRecord, type Funding, type MaterialType, type ParcelStatus, type ProofStatus,
} from "@/data/types"
import { useStudio } from "@/store/store"
import { useAnalysis } from "@/store/hooks"
import { deleteFin, newFin, patchFin, setAcqStep, setFunding, validFin } from "@/store/finance"
import { V6Section } from "./PropertiesV6"

const Lbl = ({ children }: { children: React.ReactNode }) => <span className="mb-1 block text-[11.5px] font-medium text-muted-foreground">{children}</span>

const TONE: Record<Tag["tone"], string> = {
  paid: "border-[#9FD3BB] bg-[#E7F4EE] text-[#1C6B4B]",
  pending: "border-[#F6C99A] bg-[#FFF3E6] text-[#9A4A08]",
  plan: "text-muted-foreground",
  neutral: "text-muted-foreground",
  scenario: "border-[#C9B8EE] bg-[#F1ECFB] text-[#5B3BA8]",
  warn: "border-[#E3C25C] bg-[#FFF8DB] text-[#6B4E00]",
  info: "border-[#A9D2EA] bg-[#E8F3FA] text-[#0B5F8C]",
}

export function TagChips({ tags }: { tags: Tag[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {tags.map((t) => (
        <Chip key={t.label} className={TONE[t.tone]} title={t.title}>{t.label}</Chip>
      ))}
    </div>
  )
}

function useFins() {
  const doc = useStudio((s) => s.doc)
  const sid = useStudio((s) => s.scenarioId)
  return finRecordsIn(doc, sid)
}

/** Text / date / number inputs that commit on blur, so typing doesn't flood the undo history. */
function Input({ value, onCommit, type = "text", placeholder, label }: { value: string; onCommit: (v: string) => void; type?: string; placeholder?: string; label?: string }) {
  const [v, setV] = useState(value)
  useEffect(() => setV(value), [value])
  return (
    <input aria-label={label} type={type} className="field" value={v} placeholder={placeholder} onChange={(e) => setV(e.target.value)} onBlur={() => v !== value && onCommit(v)} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />
  )
}

const parseMoney = (t: string): number | null | undefined => {
  const s = t.trim().replace(/\./g, "").replace(",", ".")
  if (s === "") return null
  const n = Number(s)
  return Number.isNaN(n) ? undefined : n
}

function Money({ value, onCommit, label }: { value: number | null | undefined; onCommit: (v: number | null) => void; label?: string }) {
  return <Input label={label} value={value == null ? "" : String(value)} placeholder="não informado" onCommit={(t) => { const n = parseMoney(t); if (n !== undefined) onCommit(n) }} />
}

/** Action (curso, atividade…): tags, acquisition, components and project participation. */
export function ActionComponentsSection({ it }: { it: EffItem }) {
  const doc = useStudio((s) => s.doc)
  const st = useStudio()
  const { items } = useAnalysis()
  const fins = useFins()
  const info = actionInfo(it, items, fins, toDay(doc.settings.referenceDate))
  const acq = acqOf(fins, it.id)
  const add = (kind: FinKind) => {
    let id = ""
    st.commit(`cadastrar ${FIN_KIND_LABEL[kind].toLowerCase()}`, (d) => {
      const r = newFin(d, kind, it, kind !== "aquisicao" && acq ? { parentId: kind === "pagamento" || kind === "nf" ? acq.id : null } : {})
      id = r.id
      return r.doc
    })
    st.selectFin(id)
  }
  const list = (kind: FinKind) => finOf(fins, it.id, kind)
  return (
    <V6Section title="Componentes da ação">
      <TagChips tags={info.tags} />
      {acq ? (
        <AcqCard a={acq} fins={fins} />
      ) : (
        <div className="rounded-md border border-dashed px-2.5 py-2 text-[12px] text-muted-foreground">
          Nenhuma aquisição registrada: a situação aparece como <b>Pagamento a validar</b>.
          <Button size="sm" className="mt-1.5" onClick={() => add("aquisicao")}><Plus className="size-3" /> Registrar aquisição</Button>
        </div>
      )}
      {(["pagamento", "nf", "material", "servico"] as FinKind[]).map((k) => (
        <FinList key={k} kind={k} records={list(k)} onAdd={() => add(k)} />
      ))}
      {info.open.length > 0 && (
        <p className="text-[11.5px] leading-snug text-[#8A5A10]">Em aberto: {info.open.join(" · ")}.</p>
      )}
      <p className="text-[11px] leading-snug text-muted-foreground">
        Mover ou redimensionar o curso altera só a execução pedagógica: pagamentos, NFs e documentos mantêm suas datas. Uma aquisição paga não implica bolsas pagas.
      </p>
      <FundingEditor it={it} />
    </V6Section>
  )
}

function AcqCard({ a, fins }: { a: FinRecord; fins: FinRecord[] }) {
  const st = useStudio()
  const { total, pays, lastDate } = paidOf(fins, a)
  const warns = acqWarnings(fins, a)
  const balance = a.contractValue != null && total != null ? a.contractValue - total : null
  return (
    <button className="block w-full rounded-md border px-2.5 py-2 text-left text-[12px] hover:bg-muted" onClick={() => st.selectFin(a.id)}>
      <div className="flex items-center justify-between gap-2">
        <b>Aquisição</b>
        <Chip className={a.acqStatus === "integralmente_pago" ? TONE.paid : TONE.pending}>{ACQ_STATUS_LABEL[a.acqStatus ?? "planejado"]}</Chip>
      </div>
      <div className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[11.5px]">
        <span className="text-muted-foreground">Fornecedor</span><span>{a.supplier ?? "não informado"}</span>
        <span className="text-muted-foreground">Contratação</span><span>{a.contractDate ? fmtDate(a.contractDate) : "não informada"}{a.contractValue != null ? ` · ${brl(a.contractValue)}` : ""}</span>
        <span className="text-muted-foreground">Pagamento</span><span>{pays.length ? `${pays.length} registro(s)${lastDate ? ` · último ${fmtDate(lastDate)}` : ""}${total != null ? ` · ${brl(total)}` : ""}` : "nenhum registro de pagamento"}</span>
        <span className="text-muted-foreground">Saldo</span><span>{balance != null ? brl(balance) : "não calculável"}</span>
        <span className="text-muted-foreground">Comprovação</span><span>{PROOF_LABEL[a.proof]}</span>
      </div>
      {warns.length > 0 && <div className="mt-1 text-[11px] leading-snug text-[#8A5A10]">{warns.map((w) => <div key={w}>• {w}</div>)}</div>}
      <div className="mt-1 text-[11px] text-primary">Abrir aquisição e etapas →</div>
    </button>
  )
}

function FinList({ kind, records, onAdd }: { kind: FinKind; records: FinRecord[]; onAdd: () => void }) {
  const st = useStudio()
  const plural: Record<string, string> = { pagamento: "Pagamentos", nf: "Notas fiscais", material: "Materiais e recursos", servico: "Serviços complementares" }
  return (
    <div>
      <div className="flex items-center justify-between">
        <Lbl>{plural[kind]}</Lbl>
        <button className="flex items-center gap-0.5 text-[11px] text-primary hover:underline" aria-label={`Cadastrar ${FIN_KIND_LABEL[kind].toLowerCase()}`} onClick={onAdd}><Plus className="size-3" /> cadastrar</button>
      </div>
      {records.length === 0 ? (
        <p className="text-[11.5px] text-muted-foreground">Nenhum registro.</p>
      ) : (
        records.map((f) => (
          <button key={f.id} className="flex w-full items-center justify-between gap-2 rounded px-1 py-0.5 text-left text-[12px] hover:bg-muted" onClick={() => st.selectFin(f.id)}>
            <span className="min-w-0 truncate">{f.name}</span>
            <span className="shrink-0 text-[11px] text-muted-foreground">{f.start ? (f.dateUndetermined ? "janela" : fmtDate(f.start)) : "sem data"} · {f.realized ? "realizado" : "previsto"}</span>
          </button>
        ))
      )}
    </div>
  )
}

/** Participation of other projects in the action — explicit, never inferred, never moving expenses. */
function FundingEditor({ it }: { it: EffItem }) {
  const doc = useStudio((s) => s.doc)
  const st = useStudio()
  const list = it.funding ?? []
  const save = (next: Funding[], label = "participação de projeto") => st.commit(label, (d) => setFunding(d, it.id, next))
  const others = doc.projects.filter((p) => p.id !== it.projectId)
  return (
    <div className="border-t pt-2">
      <Lbl>Participação de outros projetos</Lbl>
      {list.length === 0 && <p className="text-[11.5px] text-muted-foreground">Somente o projeto responsável ({doc.projects.find((p) => p.id === it.projectId)?.name ?? "—"}).</p>}
      {list.map((f, i) => (
        <div key={i} className="mb-1.5 space-y-1 rounded-md border p-2">
          <div className="flex items-center gap-1.5">
            <select aria-label="Projeto financiador" className="field" value={f.projectId} onChange={(e) => save(list.map((x, j) => (j === i ? { ...x, projectId: e.target.value } : x)))}>
              {doc.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <button aria-label="Remover participação" className="text-muted-foreground hover:text-destructive" onClick={() => save(list.filter((_, j) => j !== i), "remover participação")}><Trash2 className="size-3.5" /></button>
          </div>
          <Input label="Parcela ou componente financiado" value={f.share ?? ""} placeholder="parcela / componente financiado" onCommit={(v) => save(list.map((x, j) => (j === i ? { ...x, share: v || undefined } : x)))} />
          <Input label="Instrumento" value={f.instrument ?? ""} placeholder="instrumento associado" onCommit={(v) => save(list.map((x, j) => (j === i ? { ...x, instrument: v || undefined } : x)))} />
          <div className="grid grid-cols-2 gap-1.5">
            <Input label="Início da participação" type="date" value={f.start ?? ""} onCommit={(v) => isValidISO(v) || v === "" ? save(list.map((x, j) => (j === i ? { ...x, start: v || null } : x))) : undefined} />
            <Input label="Fim da participação" type="date" value={f.end ?? ""} onCommit={(v) => isValidISO(v) || v === "" ? save(list.map((x, j) => (j === i ? { ...x, end: v || null } : x))) : undefined} />
          </div>
        </div>
      ))}
      {others.length > 0 && (
        <Button size="sm" variant="ghost" onClick={() => save([...list, { projectId: others[0].id }], "adicionar participação")}>
          <Plus className="size-3" /> Adicionar projeto participante
        </Button>
      )}
      <p className="text-[11px] leading-snug text-muted-foreground">Ao ocultar o projeto responsável, a ação continua visível no projeto participante. Nenhuma despesa é transferida.</p>
    </div>
  )
}

/** Bolsa: installments, each with its own status — eligibility is never presumed. */
export function ParcelsSection({ it }: { it: EffItem }) {
  const st = useStudio()
  const fins = useFins()
  const parcels = finOf(fins, it.id, "parcela")
  const counts = parcels.reduce<Record<string, number>>((m, p) => ({ ...m, [p.parcelStatus ?? "prevista"]: (m[p.parcelStatus ?? "prevista"] ?? 0) + 1 }), {})
  return (
    <V6Section title="Parcelas da bolsa">
      <p className="text-[11.5px] leading-snug text-muted-foreground">Período registrado ≠ parcela devida. Parcelas dependem de frequência e desempenho; a aquisição paga do curso não quita bolsas.</p>
      {parcels.length === 0 ? (
        <p className="text-[12px] text-muted-foreground">Nenhuma parcela cadastrada.</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-1">{Object.entries(counts).map(([k, n]) => <Chip key={k}>{n} {PARCEL_LABEL[k as ParcelStatus].toLowerCase()}</Chip>)}</div>
          {parcels.map((p) => (
            <button key={p.id} className="flex w-full justify-between gap-2 rounded px-1 py-0.5 text-left text-[12px] hover:bg-muted" onClick={() => st.selectFin(p.id)}>
              <span className="truncate">{p.competencia ?? (p.start ? fmtDate(p.start, "month") : "sem competência")}</span>
              <span className="text-muted-foreground">{PARCEL_LABEL[p.parcelStatus ?? "prevista"]}</span>
            </button>
          ))}
        </>
      )}
      <Button size="sm" onClick={() => {
        let id = ""
        st.commit("cadastrar parcela", (d) => {
          const r = newFin(d, "parcela", it, { name: `Parcela — ${it.shortName ?? it.name}` })
          id = r.id
          return r.doc
        })
        st.selectFin(id)
      }}>
        <Plus className="size-3" /> Cadastrar parcela
      </Button>
    </V6Section>
  )
}

/** Editor of one financial record. Each edit is one undoable, all-or-nothing transaction. */
export function FinProps({ f }: { f: FinRecord }) {
  const doc = useStudio((s) => s.doc)
  const st = useStudio()
  const { items } = useAnalysis()
  const fins = useFins()
  const [err, setErr] = useState<string | null>(null)
  const action = items.find((i) => i.id === f.actionId)
  const patch = (p: Partial<FinRecord>, label = "editar registro financeiro") => {
    const e = validFin({ ...f, ...p })
    if (e) return setErr(e)
    setErr(null)
    st.commit(label, (d) => patchFin(d, f.id, p))
  }
  const realizedLabel: Record<FinKind, string> = {
    aquisicao: "",
    pagamento: "Pagamento realizado (há registro)",
    nf: "NF emitida (documento existente)",
    parcela: "",
    material: "Material recebido / adquirido",
    servico: "Serviço executado",
  }
  const actions = items.filter((i) => ["curso", "atividade", "operacao", "contrato", "bolsa", "turma"].includes(i.kind))
  return (
    <>
      <V6Section title={FIN_KIND_LABEL[f.kind]}>
        <Input label="Nome do registro" value={f.name} onCommit={(v) => v && patch({ name: v }, "renomear registro")} />
        <div className="flex flex-wrap gap-1">
          <Chip>{f.realized ? "realizado" : f.kind === "aquisicao" ? ACQ_STATUS_LABEL[f.acqStatus ?? "planejado"] : f.kind === "parcela" ? PARCEL_LABEL[f.parcelStatus ?? "prevista"] : "previsto"}</Chip>
          <Chip className={f.proof === "comprovado" ? TONE.paid : TONE.warn}>{PROOF_LABEL[f.proof]}</Chip>
          {f.linkStatus === "a_validar" && <Chip className={TONE.warn}>Vínculo a validar</Chip>}
          {f.scenarioId && <Chip className={TONE.scenario}>só no cenário</Chip>}
        </div>
        <label className="block">
          <Lbl>Ação vinculada</Lbl>
          <select aria-label="Ação vinculada" className="field" value={f.actionId ?? ""} onChange={(e) => patch({ actionId: e.target.value || null, linkStatus: e.target.value ? f.linkStatus : "a_validar" }, "vínculo do registro")}>
            <option value="">— vínculo a validar —</option>
            {actions.map((a) => <option key={a.id} value={a.id}>{a.shortName ?? a.name}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 text-[12px]">
          <input type="checkbox" checked={f.linkStatus === "a_validar"} onChange={() => patch({ linkStatus: f.linkStatus === "a_validar" ? "confirmado" : "a_validar" }, "vínculo a validar")} /> Vínculo com a ação a validar
        </label>
        {action && <p className="text-[11.5px] text-muted-foreground">Ação: <button className="text-primary hover:underline" onClick={() => st.select([action.id])}>{action.name}</button></p>}
      </V6Section>

      {f.kind === "aquisicao" && <AcqEditor f={f} fins={fins} patch={patch} />}

      <V6Section title={f.kind === "aquisicao" ? "Pagamento da aquisição" : "Data e valor"}>
        {f.kind === "aquisicao" ? (
          <AcqPayments a={f} fins={fins} />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              <label className="block"><Lbl>{f.dateUndetermined ? "Janela — início" : f.kind === "nf" ? "Emissão" : "Data / início"}</Lbl>
                <Input label="Data do registro" type="date" value={f.start ?? ""} onCommit={(v) => patch({ start: v || null, end: v ? (f.end && f.end >= v ? f.end : v) : null }, "data do registro")} />
              </label>
              <label className="block"><Lbl>{f.dateUndetermined ? "Janela — fim" : "Fim (período)"}</Lbl>
                <Input label="Fim do registro" type="date" value={f.end ?? ""} onCommit={(v) => patch({ end: v || f.start }, "data do registro")} />
              </label>
            </div>
            <label className="flex items-center gap-2 text-[12px]">
              <input type="checkbox" checked={!!f.dateUndetermined} onChange={() => patch({ dateUndetermined: !f.dateUndetermined }, "data a definir")} /> Data a definir (só a janela é conhecida)
            </label>
            {realizedLabel[f.kind] && (
              <label className="flex items-center gap-2 text-[12px]">
                <input type="checkbox" checked={f.realized} onChange={() => patch({ realized: !f.realized, ...(f.realized ? {} : { dateUndetermined: false }) }, "situação do registro")} /> {realizedLabel[f.kind]}
              </label>
            )}
            {f.realized && f.dateUndetermined && <p className="text-[11px] text-[#8A5A10]">Um evento realizado deve ter data. Informe a data efetiva.</p>}
            {f.kind === "parcela" && (
              <div className="grid grid-cols-2 gap-2">
                <label className="block"><Lbl>Situação da parcela</Lbl>
                  <select aria-label="Situação da parcela" className="field" value={f.parcelStatus ?? "prevista"} onChange={(e) => patch({ parcelStatus: e.target.value as ParcelStatus, realized: e.target.value === "paga" }, "situação da parcela")}>
                    {(Object.keys(PARCEL_LABEL) as ParcelStatus[]).map((k) => <option key={k} value={k}>{PARCEL_LABEL[k]}</option>)}
                  </select>
                </label>
                <label className="block"><Lbl>Beneficiários</Lbl>
                  <Money label="Beneficiários" value={f.beneficiaries} onCommit={(v) => patch({ beneficiaries: v }, "beneficiários")} />
                </label>
              </div>
            )}
            {f.kind === "material" && (
              <label className="block"><Lbl>Tipo</Lbl>
                <select className="field" value={f.materialType ?? "outro"} onChange={(e) => patch({ materialType: e.target.value as MaterialType }, "tipo de material")}>
                  {(Object.keys(MATERIAL_LABEL) as MaterialType[]).map((k) => <option key={k} value={k}>{MATERIAL_LABEL[k]}</option>)}
                </select>
              </label>
            )}
            <div className="grid grid-cols-2 gap-2">
              <label className="block"><Lbl>Valor (R$)</Lbl><Money label="Valor do registro" value={f.value} onCommit={(v) => patch({ value: v }, "valor")} /></label>
              {f.kind === "nf" || f.kind === "parcela" ? (
                <label className="block"><Lbl>Competência</Lbl><Input label="Competência" type="month" value={f.competencia ?? ""} onCommit={(v) => patch({ competencia: v || undefined }, "competência")} /></label>
              ) : (
                <label className="block"><Lbl>Fornecedor</Lbl><Input label="Fornecedor" value={f.supplier ?? ""} placeholder="não informado" onCommit={(v) => patch({ supplier: v || undefined }, "fornecedor")} /></label>
              )}
            </div>
            {(f.kind === "nf" || f.kind === "pagamento") && (
              <div className="grid grid-cols-2 gap-2">
                <label className="block"><Lbl>{f.kind === "nf" ? "Número da NF" : "Nº do documento"}</Lbl><Input label="Número do documento" value={f.docNumber ?? ""} onCommit={(v) => patch({ docNumber: v || undefined }, "número do documento")} /></label>
                <label className="block"><Lbl>Referência contratual</Lbl><Input label="Referência contratual" value={f.contractRef ?? ""} onCommit={(v) => patch({ contractRef: v || undefined }, "referência contratual")} /></label>
              </div>
            )}
            {(f.kind === "pagamento" || f.kind === "nf") && (
              <label className="block"><Lbl>Aquisição relacionada</Lbl>
                <select className="field" value={f.parentId ?? ""} onChange={(e) => patch({ parentId: e.target.value || null }, "aquisição relacionada")}>
                  <option value="">—</option>
                  {fins.filter((x) => x.kind === "aquisicao").map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </select>
              </label>
            )}
          </>
        )}
      </V6Section>

      <V6Section title="Projeto, instrumento e comprovação">
        <div className="grid grid-cols-2 gap-2">
          <label className="block"><Lbl>Projeto financiador</Lbl>
            <select aria-label="Projeto financiador do registro" className="field" value={f.fundingProjectId ?? ""} onChange={(e) => patch({ fundingProjectId: e.target.value || null }, "projeto financiador")}>
              <option value="">— o da ação —</option>
              {doc.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label className="block"><Lbl>Comprovação</Lbl>
            <select aria-label="Comprovação" className="field" value={f.proof} onChange={(e) => patch({ proof: e.target.value as ProofStatus }, "comprovação")}>
              {(Object.keys(PROOF_LABEL) as ProofStatus[]).map((k) => <option key={k} value={k}>{PROOF_LABEL[k]}</option>)}
            </select>
          </label>
        </div>
        <label className="block"><Lbl>Instrumento</Lbl><Input label="Instrumento do registro" value={f.instrument ?? ""} placeholder="não informado" onCommit={(v) => patch({ instrument: v || undefined }, "instrumento")} /></label>
        <label className="block"><Lbl>Documento comprobatório / evidência</Lbl><Input label="Evidência" value={f.evidence ?? ""} placeholder="não informado" onCommit={(v) => patch({ evidence: v || undefined }, "evidência")} /></label>
        <div>
          <Lbl>Fontes</Lbl>
          {doc.sources.map((s) => {
            const on = f.sourceIds.includes(s.id)
            return (
              <label key={s.id} className="flex items-start gap-2 text-[12px] leading-snug">
                <input type="checkbox" className="mt-0.5" checked={on} onChange={() => patch({ sourceIds: on ? f.sourceIds.filter((x) => x !== s.id) : [...f.sourceIds, s.id] }, "fonte")} />
                <span>{s.title} <span className="text-muted-foreground">· {CERTAINTY_LABEL[s.status]}</span></span>
              </label>
            )
          })}
        </div>
        <label className="block"><Lbl>Observações</Lbl>
          <textarea className="field min-h-[56px]" defaultValue={f.notes ?? ""} key={f.notes ?? ""} onBlur={(e) => e.target.value !== (f.notes ?? "") && patch({ notes: e.target.value || undefined }, "observações")} />
        </label>
        {err && <p className="flex items-center gap-1 text-[11.5px] text-destructive"><AlertTriangle className="size-3" /> {err}</p>}
        <Button size="sm" variant="danger" onClick={async () => (await confirmAction(`Excluir “${f.name}”? (é possível desfazer)`)) && (st.commit("excluir registro financeiro", (d) => deleteFin(d, f.id)), st.selectFin(null))}>
          <Trash2 className="size-3" /> Excluir registro
        </Button>
      </V6Section>
    </>
  )
}

function AcqEditor({ f, fins, patch }: { f: FinRecord; fins: FinRecord[]; patch: (p: Partial<FinRecord>, label?: string) => void }) {
  const st = useStudio()
  const warns = acqWarnings(fins, f)
  return (
    <V6Section title="Contratação e etapas">
      <div className="grid grid-cols-2 gap-2">
        <label className="block"><Lbl>Situação financeira</Lbl>
          <select aria-label="Situação da aquisição" className="field" value={f.acqStatus ?? "planejado"} onChange={(e) => patch({ acqStatus: e.target.value as AcqStatus }, "situação da aquisição")}>
            {(Object.keys(ACQ_STATUS_LABEL) as AcqStatus[]).map((k) => <option key={k} value={k}>{ACQ_STATUS_LABEL[k]}</option>)}
          </select>
        </label>
        <label className="block"><Lbl>Fornecedor</Lbl><Input label="Fornecedor da aquisição" value={f.supplier ?? ""} placeholder="não informado" onCommit={(v) => patch({ supplier: v || undefined }, "fornecedor")} /></label>
        <label className="block"><Lbl>Data de contratação</Lbl><Input label="Data de contratação" type="date" value={f.contractDate ?? ""} onCommit={(v) => patch({ contractDate: v || null }, "data de contratação")} /></label>
        <label className="block"><Lbl>Valor contratado (R$)</Lbl><Money label="Valor contratado" value={f.contractValue} onCommit={(v) => patch({ contractValue: v }, "valor contratado")} /></label>
      </div>
      <p className="text-[11px] leading-snug text-muted-foreground">Situação financeira e comprovação são independentes. Mudar a situação não altera bolsas, NFs nem a duração do curso.</p>
      {warns.length > 0 && <div className="rounded-md border border-[#E3C25C] bg-[#FFF8DB] p-2 text-[11.5px] leading-snug text-[#6B4E00]">{warns.map((w) => <div key={w}>• {w}</div>)}</div>}
      <div>
        <Lbl>Acompanhamento — cada etapa com data e evidência próprias</Lbl>
        <ol className="space-y-1">
          {ACQ_STEPS.map((s, i) => {
            const cur = f.steps?.find((x) => x.id === s.id) ?? { id: s.id, done: false }
            return (
              <li key={s.id} className="rounded-md border px-2 py-1.5">
                <label className="flex items-center gap-2 text-[12px] font-medium">
                  <input type="checkbox" aria-label={`Etapa ${s.label}`} checked={cur.done} onChange={() => st.commit(`etapa · ${s.label}`, (d) => setAcqStep(d, f.id, s.id, { done: !cur.done }))} />
                  {i + 1}. {s.label}
                  <span className="ml-auto text-[11px] font-normal text-muted-foreground">{cur.done ? (cur.date ? fmtDate(cur.date) : "registrada, sem data") : "não registrada"}</span>
                </label>
                {cur.done && (
                  <div className="mt-1 grid grid-cols-[110px_1fr] gap-1">
                    <Input label={`Data da etapa ${s.label}`} type="date" value={cur.date ?? ""} onCommit={(v) => (v === "" || isValidISO(v)) && st.commit(`data · ${s.label}`, (d) => setAcqStep(d, f.id, s.id, { date: v || null }))} />
                    <Input label={`Evidência da etapa ${s.label}`} value={cur.evidence ?? ""} placeholder="evidência" onCommit={(v) => st.commit(`evidência · ${s.label}`, (d) => setAcqStep(d, f.id, s.id, { evidence: v || undefined }))} />
                  </div>
                )}
                {cur.done && cur.evidence && <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{cur.evidence}</div>}
              </li>
            )
          })}
        </ol>
      </div>
    </V6Section>
  )
}

function AcqPayments({ a, fins }: { a: FinRecord; fins: FinRecord[] }) {
  const st = useStudio()
  const { total, pays } = paidOf(fins, a)
  const linked = fins.filter((x) => x.parentId === a.id)
  const balance = a.contractValue != null && total != null ? a.contractValue - total : null
  return (
    <>
      <div className="grid grid-cols-2 gap-1.5 text-[12px]">
        <div className="rounded-md border px-2.5 py-1.5"><div className="font-mono text-[14px] font-semibold">{total != null ? brl(total) : "—"}</div><div className="text-[11px] text-muted-foreground">pago (registros)</div></div>
        <div className="rounded-md border px-2.5 py-1.5"><div className="font-mono text-[14px] font-semibold">{balance != null ? brl(balance) : "—"}</div><div className="text-[11px] text-muted-foreground">saldo contratual</div></div>
      </div>
      <p className="text-[11px] text-muted-foreground">{pays.length} pagamento(s) realizado(s) registrados. Valores somados por registro — cada pagamento conta uma vez.</p>
      {linked.map((x) => (
        <button key={x.id} className="flex w-full justify-between gap-2 rounded px-1 py-0.5 text-left text-[12px] hover:bg-muted" onClick={() => st.selectFin(x.id)}>
          <span className="truncate">{x.name}</span>
          <span className="shrink-0 text-muted-foreground">{FIN_KIND_LABEL[x.kind]} · {x.realized ? "realizado" : "previsto"}</span>
        </button>
      ))}
      <div className="flex gap-1.5">
        {(["pagamento", "nf"] as FinKind[]).map((k) => (
          <Button key={k} size="sm" onClick={() => {
            let id = ""
            st.commit(`cadastrar ${FIN_KIND_LABEL[k].toLowerCase()}`, (d) => {
              const r = newFin(d, k, d.items.find((i) => i.id === a.actionId) ?? null, { parentId: a.id, fundingProjectId: a.fundingProjectId })
              id = r.id
              return r.doc
            })
            st.selectFin(id)
          }}>
            <Plus className="size-3" /> {k === "pagamento" ? "Pagamento" : "NF"}
          </Button>
        ))}
      </div>
    </>
  )
}
