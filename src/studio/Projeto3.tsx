import { useEffect, useMemo, useState } from "react"
import { CalendarClock, ChevronDown, ChevronUp, GripVertical, Plus, Presentation, Rocket, Trash2, Users, X } from "lucide-react"
import { Button, Chip } from "@/components/ui/button"
import { confirmAction } from "@/components/Confirm"
import { cn } from "@/lib/utils"
import { fmtDate, fromDay, isValidISO } from "@/lib/dates"
import { applyScenario, summarizeScenario } from "@/lib/analysis"
import { seedStrategy } from "@/data/v11"
import {
  IDEA_STATUS_LABEL, MILESTONE_LABEL, PILLARS,
  type Idea, type IdeaStatus, type MilestoneStatus, type PillarId, type Priority, type Strategy, type StrategyTask,
} from "@/data/types"
import { useStudio } from "@/store/store"
import { addIdea, addIdeaToScenario, addMilestone, addTask, deleteIdea, deleteTask, moveIdea, patchIdea, patchMilestone, patchStrategy, patchTask } from "@/store/strategy"

const STATUS_TONE: Record<IdeaStatus, string> = {
  ideia: "border-[#CBD5E1] bg-[#F1F4F8] text-[#475569]",
  em_analise: "border-[#A9D2EA] bg-[#E8F3FA] text-[#0B5F8C]",
  priorizada: "border-[#F6C99A] bg-[#FFF3E6] text-[#9A4A08]",
  validada: "border-[#9FD3BB] bg-[#E7F4EE] text-[#1C6B4B]",
  nao_priorizada: "border-[#E2E8F0] bg-white text-[#94A3B8] line-through",
}
const MS_TONE: Record<MilestoneStatus, string> = {
  a_confirmar: "text-muted-foreground",
  previsto: "text-[#0B5F8C]",
  realizado: "text-[#1C6B4B]",
  adiado: "text-[#9A4A08]",
  cancelado: "text-muted-foreground line-through",
}
const PRIORITY_LABEL: Record<Priority, string> = { alta: "Alta", media: "Média", baixa: "Baixa" }

function useStrategy(): Strategy {
  const s = useStudio((x) => x.doc.strategy)
  return useMemo(() => s ?? seedStrategy(), [s])
}

/** Field that commits on blur (one undo step per edit). */
function In({ value, onCommit, label, type = "text", placeholder, className }: { value: string; onCommit: (v: string) => void; label: string; type?: string; placeholder?: string; className?: string }) {
  const [v, setV] = useState(value)
  useEffect(() => setV(value), [value])
  return (
    <input aria-label={label} type={type} placeholder={placeholder} className={cn("field", className)} value={v} onChange={(e) => setV(e.target.value)}
      onBlur={() => v !== value && onCommit(v)} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />
  )
}
function Area({ value, onCommit, label, placeholder, rows = 2 }: { value: string; onCommit: (v: string) => void; label: string; placeholder?: string; rows?: number }) {
  const [v, setV] = useState(value)
  useEffect(() => setV(value), [value])
  return <textarea aria-label={label} rows={rows} placeholder={placeholder} className="field resize-y" value={v} onChange={(e) => setV(e.target.value)} onBlur={() => v !== value && onCommit(v)} />
}
const L = ({ children }: { children: React.ReactNode }) => <span className="mb-0.5 block text-[11px] font-medium text-muted-foreground">{children}</span>

/** Projeto 3 — Planejamento Estratégico: pillars board, administrative path and follow-up. */
export function Projeto3() {
  const s = useStrategy()
  const doc = useStudio((x) => x.doc)
  const st = useStudio()
  const [meeting, setMeeting] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  const p3 = useMemo(() => applyScenario(doc, st.scenarioId).find((i) => i.kind === "projeto" && i.projectId === "p3"), [doc, st.scenarioId])
  const commit = (label: string, fn: Parameters<typeof st.commit>[1]) => st.commit(label, fn)

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#FAFBFD]">
      <div className="flex flex-wrap items-start gap-4 border-b bg-white px-5 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-[19px] font-bold text-[#5B4A86]">Projeto 3 — Planejamento Estratégico</h2>
            <Chip className="border-dashed border-[#8870B5] text-[#5B4A86]">em modelagem</Chip>
            <Chip className="text-muted-foreground">sem vigência aprovada</Chip>
          </div>
          <p className="mt-0.5 max-w-[920px] text-[12px] leading-snug text-muted-foreground">
            Propostas para avaliação. Nenhuma é considerada executada, aprovada ou elegível a financiamento por estar aqui. Período no cenário ativo:{" "}
            <b className="text-foreground">{p3 ? `${fmtDate(p3.start, "month")} – ${fmtDate(p3.end, "month")}` : "—"}</b> (hipótese).
          </p>
        </div>
        <label className="flex items-center gap-2 text-[12px]" title={s.premiseNote}>
          <span className="text-muted-foreground">Premissa de duração</span>
          <In label="Premissa de duração (anos)" type="number" className="!w-16" value={String(s.premiseYears)} onCommit={(v) => commit("premissa de duração", (d) => patchStrategy(d, { premiseYears: Number(v) }))} />
          <span className="text-muted-foreground">anos · sujeita à legislação</span>
        </label>
        <Button variant="primary" onClick={() => setMeeting(true)}>
          <Presentation className="size-4" /> Modo reunião
        </Button>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-auto p-4 xl:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-4">
          <Encaminhamento s={s} />
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-4" aria-label="Quadro de ideias por pilar">
            {PILLARS.filter((p) => p.id !== "transversal").map((p) => (
              <PillarColumn key={p.id} pillar={p.id} ideas={s.ideas} open={open} setOpen={setOpen} />
            ))}
          </div>
          <PillarColumn pillar="transversal" ideas={s.ideas} open={open} setOpen={setOpen} wide />
          <AdminPath />
        </div>
        <FollowUp s={s} />
      </div>
      {meeting && <MeetingMode s={s} onClose={() => setMeeting(false)} />}
    </div>
  )
}

function Encaminhamento({ s }: { s: Strategy }) {
  const st = useStudio()
  const src = useStudio((x) => x.doc.sources.find((y) => y.id === s.encaminhamentoSourceId))
  return (
    <section className="grid gap-3 rounded-xl border bg-white p-4 md:grid-cols-[1fr_300px]">
      <div>
        <div className="text-[11px] font-bold tracking-[0.1em] text-navy uppercase">Encaminhamento registrado</div>
        <p className="mt-1 text-[13px] leading-snug text-foreground">{s.encaminhamento}</p>
        <p className="mt-1 text-[11px] text-muted-foreground">Fonte: {src?.title ?? "não informada"} · não é decisão tomada pelo sistema.</p>
      </div>
      <div className="rounded-lg border border-dashed p-2.5">
        <div className="text-[11px] font-bold tracking-[0.1em] text-navy uppercase">Validação interna da liderança</div>
        <select aria-label="Validação da liderança" className="field mt-1" value={s.leadershipValidation.status}
          onChange={(e) => st.commit("validação da liderança", (d) => patchStrategy(d, { leadershipValidation: { ...s.leadershipValidation, status: e.target.value as "pendente" | "documentada" } }))}>
          <option value="pendente">Pendente — etapa própria</option>
          <option value="documentada">Concluída e documentada</option>
        </select>
        <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{s.leadershipValidation.status === "pendente" ? "Permanece pendente até haver registro da conclusão." : "Registre a evidência no acompanhamento."}</p>
      </div>
    </section>
  )
}

function PillarColumn({ pillar, ideas, open, setOpen, wide }: { pillar: PillarId; ideas: Idea[]; open: string | null; setOpen: (id: string | null) => void; wide?: boolean }) {
  const st = useStudio()
  const p = PILLARS.find((x) => x.id === pillar)!
  const list = ideas.filter((i) => i.pillar === pillar).sort((a, b) => a.order - b.order)
  const [over, setOver] = useState(false)
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setOver(false)
    const id = e.dataTransfer.getData("text/plain")
    if (!id) return
    // Position among the cards by the pointer height.
    const cards = [...(e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>("[data-idea]")].filter((c) => c.dataset.idea !== id)
    const index = cards.findIndex((c) => e.clientY < c.getBoundingClientRect().top + c.getBoundingClientRect().height / 2)
    st.commit("mover proposta", (d) => moveIdea(d, id, pillar, index < 0 ? cards.length : index))
  }
  return (
    <section
      aria-label={`Pilar ${p.label}`}
      onDragOver={(e) => { e.preventDefault(); setOver(true) }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
      className={cn("flex min-h-[180px] flex-col rounded-xl border bg-white transition-colors", over && "border-primary bg-[#F2F8FC]")}
    >
      <header className="flex items-center gap-2 rounded-t-xl border-b px-3 py-2" style={{ borderTop: `4px solid ${p.color}` }}>
        <span className="grid size-6 place-items-center rounded-md text-[12px] font-bold text-white" style={{ background: p.color }}>{p.n}</span>
        <h3 className="min-w-0 flex-1 text-[13px] leading-tight font-bold text-foreground">{wide ? `Dimensão transversal — ${p.label}` : p.label}</h3>
        <span className="text-[11px] text-muted-foreground">{list.length}</span>
      </header>
      <div className={cn("flex-1 gap-1.5 p-2", wide ? "grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-4" : "flex flex-col")}>
        {list.map((i) => <IdeaCard key={i.id} idea={i} open={open === i.id} onToggle={() => setOpen(open === i.id ? null : i.id)} />)}
        {list.length === 0 && <p className="px-1 py-3 text-center text-[11.5px] text-muted-foreground">Arraste uma proposta para cá.</p>}
      </div>
      <button className="m-2 mt-0 flex items-center justify-center gap-1 rounded-md border border-dashed py-1.5 text-[12px] text-primary hover:bg-muted" aria-label={`Nova proposta em ${p.label}`}
        onClick={() => {
          let id = ""
          st.commit("nova proposta", (d) => {
            const r = addIdea(d, pillar)
            id = r.id
            return r.doc
          })
          setOpen(id)
        }}>
        <Plus className="size-3" /> Nova proposta
      </button>
    </section>
  )
}

function IdeaCard({ idea, open, onToggle }: { idea: Idea; open: boolean; onToggle: () => void }) {
  const st = useStudio()
  const doc = useStudio((x) => x.doc)
  const patch = (p: Partial<Idea>, label = "editar proposta") => st.commit(label, (d) => patchIdea(d, idea.id, p))
  const scen = doc.scenarios.find((x) => x.id === (doc.strategy?.scenarioId ?? ""))
  const linked = idea.linkedItemId && scen?.added.some((i) => i.id === idea.linkedItemId)
  return (
    <article data-idea={idea.id} draggable={!open} onDragStart={(e) => { e.dataTransfer.setData("text/plain", idea.id); e.dataTransfer.effectAllowed = "move" }}
      className={cn("rounded-lg border bg-white text-[12.5px] shadow-[0_1px_0_rgba(15,40,70,0.04)]", open ? "border-primary/60" : "cursor-grab hover:border-[#B6C2D0]")}>
      <button className="flex w-full items-start gap-1.5 px-2 py-1.5 text-left" onClick={onToggle} aria-expanded={open}>
        <GripVertical className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/60" />
        <span className="min-w-0 flex-1">
          <span className="block leading-snug font-semibold text-foreground">{idea.name}</span>
          <span className="mt-0.5 flex flex-wrap gap-1">
            <span className={cn("rounded-full border px-1.5 text-[10.5px] font-semibold", STATUS_TONE[idea.status])}>{IDEA_STATUS_LABEL[idea.status]}</span>
            {idea.priority && <span className="rounded-full border px-1.5 text-[10.5px] text-muted-foreground">prioridade {PRIORITY_LABEL[idea.priority].toLowerCase()}</span>}
            {linked && <span className="rounded-full border border-[#C9B8EE] bg-[#F4F0FB] px-1.5 text-[10.5px] text-[#5B4A86]">no cenário</span>}
          </span>
        </span>
        {open ? <ChevronUp className="size-3.5 text-muted-foreground" /> : <ChevronDown className="size-3.5 text-muted-foreground" />}
      </button>
      {open && (
        <div className="space-y-1.5 border-t px-2 pt-1.5 pb-2">
          <label className="block"><L>Nome</L><In label="Nome da proposta" value={idea.name} onCommit={(v) => v.trim() && patch({ name: v.trim() })} /></label>
          <label className="block"><L>Descrição</L><Area label="Descrição da proposta" value={idea.description ?? ""} onCommit={(v) => patch({ description: v || undefined })} /></label>
          <div className="grid grid-cols-2 gap-1.5">
            <label className="block"><L>Pilar</L>
              <select aria-label="Pilar" className="field" value={idea.pillar} onChange={(e) => st.commit("mover proposta", (d) => moveIdea(d, idea.id, e.target.value as PillarId, 999))}>
                {PILLARS.map((p) => <option key={p.id} value={p.id}>{p.n} · {p.label}</option>)}
              </select>
            </label>
            <label className="block"><L>Situação</L>
              <select aria-label="Situação da proposta" className="field" value={idea.status} onChange={(e) => patch({ status: e.target.value as IdeaStatus }, "situação da proposta")}>
                {(Object.keys(IDEA_STATUS_LABEL) as IdeaStatus[]).map((k) => <option key={k} value={k}>{IDEA_STATUS_LABEL[k]}</option>)}
              </select>
            </label>
            <label className="block"><L>Prioridade</L>
              <select aria-label="Prioridade" className="field" value={idea.priority ?? ""} onChange={(e) => patch({ priority: (e.target.value || null) as Priority | null }, "prioridade")}>
                <option value="">—</option>
                {(Object.keys(PRIORITY_LABEL) as Priority[]).map((k) => <option key={k} value={k}>{PRIORITY_LABEL[k]}</option>)}
              </select>
            </label>
            <label className="block"><L>Responsável</L><In label="Responsável" value={idea.owner ?? ""} placeholder="a definir" onCommit={(v) => patch({ owner: v || undefined })} /></label>
            <label className="block"><L>Início pretendido</L><In label="Início pretendido" type="date" value={idea.start ?? ""} onCommit={(v) => (v === "" || isValidISO(v)) && patch({ start: v || null })} /></label>
            <label className="block"><L>Fim pretendido</L><In label="Fim pretendido" type="date" value={idea.end ?? ""} onCommit={(v) => (v === "" || isValidISO(v)) && patch({ end: v || null })} /></label>
            <label className="block"><L>Custo estimado (R$)</L>
              <In label="Custo estimado" value={idea.cost == null ? "" : String(idea.cost)} placeholder="não estimado" onCommit={(v) => { const n = v.trim() === "" ? null : Number(v.replace(/\./g, "").replace(",", ".")); if (n === null || !Number.isNaN(n)) patch({ cost: n }) }} />
            </label>
            <label className="block"><L>Dependências</L><In label="Dependências" value={idea.dependencies ?? ""} onCommit={(v) => patch({ dependencies: v || undefined })} /></label>
          </div>
          <label className="block"><L>Fonte ou justificativa</L><In label="Fonte ou justificativa" value={idea.source ?? ""} onCommit={(v) => patch({ source: v || undefined })} /></label>
          <label className="block"><L>Observações</L><Area label="Observações da proposta" value={idea.notes ?? ""} onCommit={(v) => patch({ notes: v || undefined })} /></label>
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <Button size="sm" variant="primary" disabled={idea.status !== "validada" || !!linked}
              title={idea.status !== "validada" ? "Disponível quando a proposta estiver “Validada internamente”." : linked ? "Já está no cenário." : "Cria um registro planejado no cenário do Projeto 3 (não é aprovação)."}
              onClick={() => {
                let msg = ""
                st.commit("adicionar ao cenário do Projeto 3", (d) => {
                  const r = addIdeaToScenario(d, idea.id)
                  msg = r.reason ?? ""
                  return r.doc
                })
                st.toast(msg || `“${idea.name}” adicionada ao Cenário B como registro planejado (hipótese, não aprovação).`, msg ? "warn" : "ok")
              }}>
              <Rocket className="size-3" /> Adicionar ao cenário do Projeto 3
            </Button>
            <Button size="sm" variant="danger" className="ml-auto" aria-label="Excluir proposta" onClick={async () => (await confirmAction(`Excluir a proposta “${idea.name}”? (é possível desfazer)`)) && st.commit("excluir proposta", (d) => deleteIdea(d, idea.id))}>
              <Trash2 className="size-3" />
            </Button>
          </div>
          {linked && <p className="text-[11px] text-[#5B4A86]">Registro planejado no {scen?.name}. Abra o cenário para vê-lo na timeline.</p>}
        </div>
      )}
    </article>
  )
}

/** Prorrogação × Projeto 3 — both hypotheses; the documental baseline stays as it is. */
export function AdminPath({ big }: { big?: boolean }) {
  const doc = useStudio((x) => x.doc)
  const st = useStudio()
  const a = doc.scenarios.find((x) => x.id === "alt-prorrogacao")
  const b = doc.scenarios.find((x) => x.id === doc.strategy?.scenarioId)
  const sa = a ? summarizeScenario(doc, a.id) : null
  const sb = b ? summarizeScenario(doc, b.id) : null
  const card = (title: string, sc: typeof a, sum: typeof sa, lines: string[], tone: string) => (
    <div className={cn("rounded-xl border-2 bg-white p-3", sc && st.scenarioId === sc.id && "border-primary")}>
      <div className="flex items-center gap-2">
        <span className="rounded px-1.5 py-0.5 text-[10.5px] font-bold text-white" style={{ background: tone }}>HIPÓTESE</span>
        <b className={big ? "text-[20px]" : "text-[13.5px]"}>{title}</b>
      </div>
      {sum && (
        <p className={cn("mt-1 text-muted-foreground", big ? "text-[16px]" : "text-[11.5px]")}>
          Vigência no cenário até {sum.vigEnd != null ? fmtDate(fromDay(sum.vigEnd - 1)) : "—"} · Projeto 3 {sum.p3 ? `a partir de ${fmtDate(sum.p3.start, "month")}` : "—"}
        </p>
      )}
      <ul className={cn("mt-1.5 space-y-0.5", big ? "text-[17px]" : "text-[12px]")}>
        {lines.map((l) => <li key={l}>• {l}</li>)}
      </ul>
      {sc && !big && <Button size="sm" variant="ghost" className="mt-1" onClick={() => st.setScenario(sc.id)}>Ver na timeline</Button>}
    </div>
  )
  return (
    <section aria-label="Caminho administrativo" className={cn("rounded-xl border bg-white p-4", big && "border-0 p-0")}>
      {!big && (
        <>
          <div className="text-[11px] font-bold tracking-[0.1em] text-navy uppercase">Caminho administrativo — prorrogação ou novo projeto</div>
          <p className="mt-0.5 text-[11.5px] text-muted-foreground">As duas alternativas são hipóteses comparadas lado a lado; nenhuma substitui a linha de base documental (encerramento de referência 30/06/2027).</p>
        </>
      )}
      <div className="mt-2 grid gap-3 md:grid-cols-2">
        {card("Cenário A — Prorrogação do Projeto 2", a, sa, ["Extensão temporal hipotética", "Dependência jurídica e administrativa", "Necessidade de verificar recursos", "Continuidade das obrigações existentes"], "#4338CA")}
        {card("Cenário B — Estruturação do Projeto 3", b, sb, ["Novo planejamento e novo orçamento", "Continuidade educacional", "Revisão da estrutura operacional", "Pesquisa e inovação", "Necessidade de aprovação e formalização"], "#8870B5")}
      </div>
    </section>
  )
}

function FollowUp({ s }: { s: Strategy }) {
  const st = useStudio()
  const ref = useStudio((x) => x.doc.settings.referenceDate)
  const [newTask, setNewTask] = useState<Record<StrategyTask["kind"], string>>({ prioridade: "", pendencia: "", proxima_acao: "" })
  const m = s.meeting
  const setMeeting = (p: Partial<Strategy["meeting"]>) => st.commit("reunião de alinhamento", (d) => patchStrategy(d, { meeting: { ...m, ...p } }))
  const kinds: [StrategyTask["kind"], string][] = [["prioridade", "Prioridades definidas"], ["pendencia", "Pendências"], ["proxima_acao", "Próximas ações"]]
  return (
    <aside aria-label="Acompanhamento estratégico" className="space-y-3">
      <section className="rounded-xl border bg-white p-3">
        <div className="flex items-center gap-1.5 text-[11px] font-bold tracking-[0.1em] text-navy uppercase"><Users className="size-3.5" /> Alinhamento com a liderança</div>
        <p className="mt-1 text-[12.5px] font-semibold">{m.title}</p>
        <div className="mt-1.5 grid grid-cols-2 gap-1.5">
          <label className="block"><L>Data</L><In label="Data da reunião" type="date" value={m.date ?? ""} onCommit={(v) => (v === "" || isValidISO(v)) && setMeeting({ date: v || null })} /></label>
          <label className="block"><L>Situação</L>
            <select aria-label="Situação da reunião" className="field" value={m.status} onChange={(e) => setMeeting({ status: e.target.value as MilestoneStatus })}>
              {(Object.keys(MILESTONE_LABEL) as MilestoneStatus[]).map((k) => <option key={k} value={k}>{MILESTONE_LABEL[k]}</option>)}
            </select>
          </label>
        </div>
        <label className="mt-1.5 block"><L>Participantes</L><In label="Participantes" value={m.participants} onCommit={(v) => setMeeting({ participants: v || "a confirmar" })} /></label>
        <p className="mt-1 text-[11px] text-muted-foreground">Presença e aprovação não são presumidas.</p>
      </section>

      <section className="rounded-xl border bg-white p-3">
        <div className="flex items-center gap-1.5 text-[11px] font-bold tracking-[0.1em] text-navy uppercase"><CalendarClock className="size-3.5" /> Marcos de referência (ata 02/10/2026)</div>
        <ul className="mt-1.5 space-y-1.5">
          {s.milestones.map((ms) => {
            const passed = ms.date && ms.date < ref && ms.status === "previsto"
            return (
              <li key={ms.id} className="rounded-lg border px-2 py-1.5">
                <div className="flex items-center gap-2">
                  <span className="w-[74px] shrink-0 font-mono text-[11.5px] text-foreground">{ms.date ? `${fmtDate(ms.date).slice(0, 5)}${ms.dateEnd ? `–${fmtDate(ms.dateEnd).slice(0, 2)}` : ""}` : "s/ data"}</span>
                  <span className="min-w-0 flex-1 text-[12px] leading-snug font-medium">{ms.title}</span>
                </div>
                <div className="mt-1 flex items-center gap-1.5">
                  <select aria-label={`Situação: ${ms.title}`} className={cn("field !w-auto !py-0.5 !text-[11.5px] font-semibold", MS_TONE[ms.status])} value={ms.status}
                    onChange={(e) => st.commit("situação do marco", (d) => patchMilestone(d, ms.id, { status: e.target.value as MilestoneStatus }))}>
                    {(Object.keys(MILESTONE_LABEL) as MilestoneStatus[]).map((k) => <option key={k} value={k}>{MILESTONE_LABEL[k]}</option>)}
                  </select>
                  <In label={`Responsável: ${ms.title}`} className="!py-0.5 !text-[11.5px]" value={ms.owner ?? ""} placeholder="responsável" onCommit={(v) => st.commit("responsável do marco", (d) => patchMilestone(d, ms.id, { owner: v || undefined }))} />
                </div>
                {passed && <p className="mt-0.5 text-[10.5px] text-[#8A5A10]">Data passou; situação real ainda não atualizada.</p>}
              </li>
            )
          })}
        </ul>
        <Button size="sm" variant="ghost" className="mt-1" onClick={() => st.commit("novo marco", (d) => addMilestone(d))}><Plus className="size-3" /> Marco</Button>
      </section>

      {kinds.map(([k, title]) => (
        <section key={k} className="rounded-xl border bg-white p-3">
          <div className="text-[11px] font-bold tracking-[0.1em] text-navy uppercase">{title}</div>
          <ul className="mt-1 space-y-1">
            {s.tasks.filter((t) => t.kind === k).map((t) => (
              <li key={t.id} className="flex items-center gap-1.5 text-[12px]">
                <input type="checkbox" aria-label={`Concluída: ${t.text}`} checked={t.done} onChange={() => st.commit("item de acompanhamento", (d) => patchTask(d, t.id, { done: !t.done }))} />
                <span className={cn("min-w-0 flex-1", t.done && "text-muted-foreground line-through")}>{t.text}</span>
                <In label={`Responsável: ${t.text}`} className="!w-24 !py-0.5 !text-[11px]" value={t.owner ?? ""} placeholder="responsável" onCommit={(v) => st.commit("responsável", (d) => patchTask(d, t.id, { owner: v || undefined }))} />
                <button aria-label="Remover" className="text-muted-foreground hover:text-destructive" onClick={() => st.commit("remover item", (d) => deleteTask(d, t.id))}><X className="size-3" /></button>
              </li>
            ))}
            {!s.tasks.some((t) => t.kind === k) && <li className="text-[11.5px] text-muted-foreground">Nenhum registro.</li>}
          </ul>
          <form className="mt-1.5 flex gap-1" onSubmit={(e) => { e.preventDefault(); st.commit(`adicionar · ${title.toLowerCase()}`, (d) => addTask(d, k, newTask[k])); setNewTask({ ...newTask, [k]: "" }) }}>
            <input aria-label={`Adicionar em ${title}`} className="field !py-1 !text-[12px]" placeholder="Adicionar…" value={newTask[k]} onChange={(e) => setNewTask({ ...newTask, [k]: e.target.value })} />
            <Button size="sm" type="submit" disabled={!newTask[k].trim()}><Plus className="size-3" /></Button>
          </form>
        </section>
      ))}
    </aside>
  )
}

/** Meeting mode: the pillars, large and calm, for discussing with the leadership. */
function MeetingMode({ s, onClose }: { s: Strategy; onClose: () => void }) {
  const st = useStudio()
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && !(e.target as HTMLElement).closest("textarea,input") && onClose()
    window.addEventListener("keydown", k)
    return () => window.removeEventListener("keydown", k)
  }, [onClose])
  const next: Record<IdeaStatus, IdeaStatus> = { ideia: "em_analise", em_analise: "priorizada", priorizada: "validada", validada: "nao_priorizada", nao_priorizada: "ideia" }
  return (
    <div role="dialog" aria-label="Modo reunião" className="fixed inset-0 z-50 flex flex-col bg-white">
      <div className="flex items-center gap-3 border-b px-8 py-4">
        <div>
          <div className="text-[12px] font-bold tracking-[0.16em] text-[#5B4A86] uppercase">Reunião de alinhamento · Projeto 3</div>
          <div className="font-display text-[26px] font-extrabold text-foreground">Como queremos seguir</div>
        </div>
        <p className="ml-6 max-w-[520px] text-[13px] leading-snug text-muted-foreground">
          {s.meeting.title} · participantes: {s.meeting.participants} · {MILESTONE_LABEL[s.meeting.status].toLowerCase()}. Presença e aprovação não presumidas: registre apenas o que for discutido.
        </p>
        <Button className="ml-auto" variant="primary" onClick={onClose}>Encerrar reunião</Button>
      </div>
      <div className="grid flex-1 grid-cols-2 gap-5 overflow-auto p-8 xl:grid-cols-4">
        {PILLARS.filter((p) => p.id !== "transversal").map((p) => (
          <section key={p.id} className="flex flex-col rounded-2xl border-2 p-5" style={{ borderColor: `${p.color}55` }}>
            <div className="flex items-center gap-2">
              <span className="grid size-9 place-items-center rounded-xl text-[17px] font-bold text-white" style={{ background: p.color }}>{p.n}</span>
              <h3 className="text-[20px] leading-tight font-bold">{p.label}</h3>
            </div>
            <ul className="mt-3 space-y-1.5">
              {s.ideas.filter((i) => i.pillar === p.id).sort((a, b) => a.order - b.order).map((i) => (
                <li key={i.id} className="flex items-start gap-2 text-[16px] leading-snug">
                  <button title="Clique para avançar a situação" className={cn("mt-0.5 shrink-0 rounded-full border px-2 text-[11.5px] font-semibold", STATUS_TONE[i.status])}
                    onClick={() => st.commit("situação da proposta (reunião)", (d) => patchIdea(d, i.id, { status: next[i.status] }))}>
                    {IDEA_STATUS_LABEL[i.status]}
                  </button>
                  <span>{i.name}</span>
                </li>
              ))}
            </ul>
            <label className="mt-auto block pt-4">
              <span className="mb-1 block text-[12px] font-semibold text-muted-foreground">Notas da discussão</span>
              <Area label={`Notas: ${p.label}`} rows={3} value={s.pillarNotes[p.id] ?? ""} onCommit={(v) => st.commit("notas do pilar", (d) => patchStrategy(d, { pillarNotes: { ...s.pillarNotes, [p.id]: v } }))} />
            </label>
          </section>
        ))}
      </div>
      <div className="border-t px-8 py-3 text-[14px] text-muted-foreground">
        Transversal: {s.ideas.filter((i) => i.pillar === "transversal").map((i) => i.name).join(" · ")}. Premissa de {s.premiseYears} anos, sujeita à legislação aplicável.
      </div>
    </div>
  )
}
