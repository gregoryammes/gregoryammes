import { useEffect, useState } from "react"
import { Compass, Maximize2, Plus, Trash2 } from "lucide-react"
import { Button, Chip } from "@/components/ui/button"
import { confirmAction } from "@/components/Confirm"
import { fmtDate, fmtMonthsSpan, isValidISO } from "@/lib/dates"
import type { EffItem } from "@/lib/analysis"
import { docVigRange, offeringLabel, studentsShown, summarizeConsolidation, TEMPORAL_LABEL, temporalSituation, turmasOf } from "@/lib/v6"
import { CERTAINTY_LABEL, FIN_LABEL, type Certainty, type FinSituation, type Turma } from "@/data/types"
import { useStudio } from "@/store/store"
import { useAnalysis } from "@/store/hooks"
import { useView } from "@/store/view"
import { deleteTurma, newTurmaFor, patchTurma, setItemTurmas } from "@/store/turmas"

const CERTAINTIES = Object.keys(CERTAINTY_LABEL) as Certainty[]
const FINS = Object.keys(FIN_LABEL) as FinSituation[]

export function V6Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b px-4 py-3.5">
      <h3 className="mb-2.5 text-[11px] font-bold tracking-[0.1em] text-navy uppercase">{title}</h3>
      <div className="space-y-2">{children}</div>
    </section>
  )
}

const Lbl = ({ children }: { children: React.ReactNode }) => <span className="mb-1 block text-[11.5px] font-medium text-muted-foreground">{children}</span>

/** Level C: what a project contains, and the way into its activities. */
export function ProjectSummary({ it }: { it: EffItem }) {
  const doc = useStudio((s) => s.doc)
  const { items, overruns } = useAnalysis()
  const mine = items.filter((i) => i.projectId === it.projectId && i.id !== it.id)
  const turmas = (doc.turmas ?? []).filter((t) => t.projectId === it.projectId)
  const after = overruns.filter((o) => o.item.projectId === it.projectId)
  const explore = () => {
    const v = useView.getState()
    v.set({
      displayMode: v.displayMode === "all" || v.displayMode === "filtered" ? "all" : "courses",
      studioView: "timeline",
      hiddenProjects: doc.projects.filter((p) => p.id !== it.projectId).map((p) => p.id),
    })
    // Centre the project's interval, with room for activities that run past it.
    const end = Math.max(it.range.end, ...mine.map((m) => m.range.end))
    const start = Math.min(it.range.start, ...mine.map((m) => m.range.start))
    v.fit(start, end)
    v.set({ range: null })
    useStudio.getState().toast(`Explorando ${doc.projects.find((p) => p.id === it.projectId)?.name ?? it.name}. Os outros projetos estão só ocultos (botões P1/P2/P3).`, "info")
  }
  return (
    <V6Section title="Resumo do projeto">
      <div className="text-[12.5px] leading-snug">
        <b>{it.dateUndetermined ? "Período geral" : "Período"}:</b> {fmtDate(it.start, it.precision)} – {fmtDate(it.end, it.precision)}
        {it.certainty === "hipotese" && <span className="ml-1 text-navy">· em modelagem, não aprovado</span>}
      </div>
      <div className="grid grid-cols-2 gap-1.5 text-[12px]">
        <Stat n={mine.filter((m) => m.kind === "curso").length} label="ofertas de curso" />
        <Stat n={turmas.length} label="turmas" />
        <Stat n={mine.filter((m) => m.kind === "bolsa").length} label="registros de bolsa" />
        <Stat n={after.length} label="após a vigência" tone={after.length ? "after" : undefined} />
      </div>
      <Button variant="primary" className="w-full justify-center" onClick={explore}>
        <Compass className="size-4" /> Explorar este projeto
      </Button>
      <Button variant="outline" className="w-full justify-center" onClick={() => {
        const end = Math.max(it.range.end, ...mine.map((m) => m.range.end))
        const start = Math.min(it.range.start, ...mine.map((m) => m.range.start))
        useView.getState().fit(start, end)
        useView.getState().set({ range: null })
      }}>
        <Maximize2 className="size-4" /> Ajustar período ao projeto
      </Button>
    </V6Section>
  )
}

function Stat({ n, label, tone }: { n: number; label: string; tone?: "after" }) {
  return (
    <div className="rounded-md border px-2.5 py-1.5">
      <div className={`font-mono text-[16px] font-semibold ${tone ? "text-[#9A4A08]" : ""}`}>{n}</div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </div>
  )
}

/** Temporal and financial situations are independent: one never implies the other. */
export function SituationChips({ it }: { it: EffItem }) {
  const doc = useStudio((s) => s.doc)
  const vig = docVigRange(doc)
  const t = temporalSituation(it.range, vig, it.dateUndetermined)
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-[12px]">
        <span className="text-muted-foreground">Situação temporal</span>
        <span className={`font-semibold ${t.key === "dentro" ? "text-foreground" : t.key === "sem_ref" ? "text-muted-foreground" : "text-[#9A4A08]"}`}>
          {TEMPORAL_LABEL[t.key]}{t.after ? ` · ${t.months} m (${fmtMonthsSpan(t.after)})` : ""}
        </span>
      </div>
      <label className="block">
        <Lbl>Situação financeira</Lbl>
        <select
          className="field"
          value={it.finSituation ?? "pendente"}
          onChange={(e) => useStudio.getState().patchItem(it.id, { finSituation: e.target.value as FinSituation }, "situação financeira")}
        >
          {FINS.map((f) => <option key={f} value={f}>{FIN_LABEL[f]}</option>)}
        </select>
      </label>
      <p className="text-[11px] leading-snug text-muted-foreground">
        Após a vigência ≠ sem cobertura. Saldo disponível não autoriza, por si, despesa posterior à vigência.
      </p>
    </div>
  )
}

/** Curso (catalogue) · Oferta (this record) · Turmas — kept as separate, linked entities. */
export function CourseTurmaSection({ it }: { it: EffItem }) {
  const doc = useStudio((s) => s.doc)
  const st = useStudio()
  const { items } = useAnalysis()
  const ts = turmasOf(doc, it)
  const others = (doc.turmas ?? []).filter((t) => !ts.some((x) => x.id === t.id))
  const bolsas = items.filter((b) => b.kind === "bolsa" && (b.parentId === it.id || (b.turmaIds ?? []).some((x) => ts.some((t) => t.id === x))))
  const [open, setOpen] = useState<string | null>(ts[0]?.id ?? null)
  return (
    <V6Section title="Curso · oferta · turma">
      <label className="block">
        <Lbl>Curso (catálogo)</Lbl>
        <select className="field" value={it.courseId ?? ""} onChange={(e) => st.patchItem(it.id, { courseId: e.target.value || null }, "curso do catálogo")}>
          <option value="">— a identificar —</option>
          {(doc.courses ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      <div className="rounded-md bg-muted px-2.5 py-1.5 text-[12px]">
        <span className="text-muted-foreground">Oferta:</span> <b>{it.name}</b>
        <div className="font-medium text-primary">{offeringLabel(doc, it, true)}</div>
      </div>
      <div>
        <Lbl>Turmas desta oferta</Lbl>
        {ts.length === 0 && <p className="rounded-md border border-dashed px-2.5 py-2 text-[12px] text-muted-foreground">Turma a identificar.</p>}
        {ts.map((t) => (
          <TurmaEditor key={t.id} t={t} open={open === t.id} onToggle={() => setOpen(open === t.id ? null : t.id)} offeringId={it.id} />
        ))}
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Button
            size="sm"
            onClick={() => {
              let created = ""
              st.commit("cadastrar turma", (d) => {
                const r = newTurmaFor(d, it, st.scenarioId)
                created = r.id
                return r.doc
              })
              setOpen(created)
            }}
          >
            <Plus className="size-3" /> Cadastrar turma
          </Button>
          {others.length > 0 && (
            <select
              aria-label="Vincular turma existente"
              className="field !w-auto !py-0.5"
              value=""
              onChange={(e) => {
                const id = e.target.value
                if (id) st.commit("vincular turma", (d) => patchTurma(setItemTurmas(d, it.id, (cur) => [...new Set([...cur, id])], st.scenarioId), id, { offeringId: it.id }))
              }}
            >
              <option value="">Vincular existente…</option>
              {others.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          )}
        </div>
      </div>
      <div>
        <Lbl>Bolsas associadas</Lbl>
        {bolsas.length === 0 ? (
          <p className="text-[12px] text-muted-foreground">Nenhuma bolsa vinculada.</p>
        ) : (
          bolsas.map((b) => (
            <button key={b.id} className="block w-full truncate rounded px-1 py-0.5 text-left text-[12px] text-primary hover:bg-muted" onClick={() => st.select([b.id])}>
              {b.name} · {fmtDate(b.start, "month")}–{fmtDate(b.end, "month")}
            </button>
          ))
        )}
      </div>
    </V6Section>
  )
}

function TurmaEditor({ t, open, onToggle, offeringId }: { t: Turma; open: boolean; onToggle: () => void; offeringId: string }) {
  const doc = useStudio((s) => s.doc)
  const st = useStudio()
  const [draft, setDraft] = useState(t)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => setDraft(t), [t])
  const save = (patch: Partial<Turma>) => {
    const next = { ...draft, ...patch }
    if (!isValidISO(next.start) || !isValidISO(next.end) || next.end < next.start) return setErr("Período inválido: o fim deve ser igual ou posterior ao início.")
    setErr(null)
    st.commit("editar turma", (d) => patchTurma(d, t.id, patch))
  }
  return (
    <div className="mb-1.5 rounded-md border">
      <button className="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left text-[12.5px]" onClick={onToggle} aria-expanded={open}>
        <span className="min-w-0 truncate font-semibold">{t.name}</span>
        <Chip className={t.status === "hipotese" ? "border-navy/40 text-navy" : "text-muted-foreground"}>{CERTAINTY_LABEL[t.status]}</Chip>
      </button>
      {open && (
        <div className="space-y-2 border-t px-2.5 py-2">
          <label className="block"><Lbl>Nome da turma</Lbl>
            <input aria-label="Nome da turma" className="field" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} onBlur={() => draft.name !== t.name && save({ name: draft.name })} />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block"><Lbl>Ano de entrada</Lbl>
              <input type="number" className="field" value={draft.entryYear} onChange={(e) => setDraft({ ...draft, entryYear: +e.target.value })} onBlur={() => draft.entryYear !== t.entryYear && save({ entryYear: draft.entryYear })} />
            </label>
            <label className="block"><Lbl>Status</Lbl>
              <select className="field" value={t.status} onChange={(e) => save({ status: e.target.value as Certainty })}>
                {CERTAINTIES.map((c) => <option key={c} value={c}>{CERTAINTY_LABEL[c]}</option>)}
              </select>
            </label>
            <label className="block"><Lbl>Início</Lbl>
              <input type="date" className="field" value={draft.start} onChange={(e) => setDraft({ ...draft, start: e.target.value })} onBlur={() => draft.start !== t.start && save({ start: draft.start })} />
            </label>
            <label className="block"><Lbl>Fim</Lbl>
              <input type="date" className="field" value={draft.end} onChange={(e) => setDraft({ ...draft, end: e.target.value })} onBlur={() => draft.end !== t.end && save({ end: draft.end })} />
            </label>
            <label className="block"><Lbl>Alunos</Lbl>
              <input className="field font-mono" placeholder="não informado" inputMode="numeric" value={draft.students ?? ""}
                onChange={(e) => setDraft({ ...draft, students: e.target.value === "" ? null : Number(e.target.value) })}
                onBlur={() => draft.students !== t.students && save({ students: draft.students })} />
            </label>
            <label className="block"><Lbl>Evidência da quantidade</Lbl>
              <select className="field" value={t.studentsCertainty ?? "nao_informado"} onChange={(e) => save({ studentsCertainty: e.target.value as Certainty })}>
                {CERTAINTIES.map((c) => <option key={c} value={c}>{CERTAINTY_LABEL[c]}</option>)}
              </select>
            </label>
            <label className="block"><Lbl>Etapa formativa</Lbl>
              <select className="field" value={t.stage} onChange={(e) => save({ stage: e.target.value as Turma["stage"] })}>
                <option value="jornada">Jornada Tecnológica</option>
                <option value="robotica">Robótica</option>
                <option value="tecnico">Técnico</option>
                <option value="graduacao">Graduação</option>
                <option value="outra">Outra</option>
              </select>
            </label>
            <label className="block"><Lbl>Geração vinculada</Lbl>
              <select className="field" value={t.generationId ?? ""} onChange={(e) => save({ generationId: e.target.value || null })}>
                <option value="">— não documentada —</option>
                {(doc.generations ?? []).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </label>
          </div>
          {t.students != null && !studentsShown(t) && (
            <p className="text-[11px] text-[#6B4E00]">{t.students} alunos informados, a validar: a quantidade só aparece na timeline quando comprovada.</p>
          )}
          {err && <p className="text-[11px] text-destructive">{err}</p>}
          <label className="block"><Lbl>Observações</Lbl>
            <textarea className="field min-h-[48px]" value={draft.notes ?? ""} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} onBlur={() => draft.notes !== t.notes && save({ notes: draft.notes })} />
          </label>
          <div className="flex justify-between">
            <Button size="sm" variant="ghost" onClick={() => st.commit("desvincular turma", (d) => setItemTurmas(patchTurma(d, t.id, { offeringId: null }), offeringId, (cur) => cur.filter((x) => x !== t.id), st.scenarioId))}>
              Desvincular
            </Button>
            <Button size="sm" variant="danger" onClick={async () => (await confirmAction(`Excluir a turma “${t.name}”? Os vínculos serão removidos (é possível desfazer).`)) && st.commit("excluir turma", (d) => deleteTurma(d, t.id))}>
              <Trash2 className="size-3" /> Excluir turma
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

/** Bolsa: beneficiary turmas, consolidated row and partner (administrative). */
export function BolsaLinksSection({ it }: { it: EffItem }) {
  const doc = useStudio((s) => s.doc)
  const st = useStudio()
  const turmas = doc.turmas ?? []
  const sel = new Set(it.turmaIds ?? [])
  const [partner, setPartner] = useState(it.partner ?? "")
  useEffect(() => setPartner(it.partner ?? ""), [it.partner])
  return (
    <V6Section title="Vínculos da bolsa">
      <div>
        <Lbl>Turmas beneficiárias</Lbl>
        {turmas.length === 0 && <p className="text-[12px] text-muted-foreground">Nenhuma turma cadastrada.</p>}
        {turmas.map((t) => (
          <label key={t.id} className="flex items-center gap-2 py-0.5 text-[12px]">
            <input type="checkbox" checked={sel.has(t.id)} onChange={() => st.commit("turmas da bolsa", (d) => setItemTurmas(d, it.id, (cur) => (cur.includes(t.id) ? cur.filter((x) => x !== t.id) : [...cur, t.id]), st.scenarioId))} />
            {t.name}
          </label>
        ))}
      </div>
      <label className="block">
        <Lbl>Linha consolidada na timeline</Lbl>
        <select className="field" value={it.consolidation ?? ""} onChange={(e) => st.patchItem(it.id, { consolidation: e.target.value || null }, "linha consolidada")}>
          <option value="">— linha própria —</option>
          {(doc.consolidations ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      <label className="block">
        <Lbl>Parceiro / fornecedor (administrativo)</Lbl>
        <input className="field" value={partner} placeholder="não informado" onChange={(e) => setPartner(e.target.value)} onBlur={() => partner !== (it.partner ?? "") && st.patchItem(it.id, { partner: partner || undefined }, "parceiro")} />
      </label>
    </V6Section>
  )
}

/** Selection of a whole consolidated row: the programme, built from its separate records. */
export function ConsolidationProps({ consKey }: { consKey: string }) {
  const doc = useStudio((s) => s.doc)
  const st = useStudio()
  const { items } = useAnalysis()
  const c = (doc.consolidations ?? []).find((x) => x.id === consKey)
  const sum = summarizeConsolidation(items, consKey)
  const vig = docVigRange(doc)
  return (
    <>
      <V6Section title="Programa consolidado">
        <div className="text-[14px] font-semibold">{c?.name}</div>
        {c?.subtitle && <div className="text-[12px] text-muted-foreground">{c.subtitle}</div>}
        <div className="grid grid-cols-2 gap-1.5 text-[12px]">
          <Stat n={sum.periods} label="períodos cadastrados" />
          <Stat n={sum.members.filter((m) => m.students != null).length} label="com bolsistas informados" />
        </div>
        <p className="text-[12px] leading-snug">
          {sum.recordStudents != null ? (
            <>Soma dos registros: <b>{sum.recordStudents} bolsistas</b>. Alunos distintos <b>não identificados</b>: a soma pode contar a mesma pessoa mais de uma vez.</>
          ) : (
            "Quantidade de bolsistas não informada."
          )}
        </p>
        <p className="text-[11px] text-muted-foreground">Agrupamento só visual: contratos, valores e registros de origem continuam separados.</p>
      </V6Section>
      <V6Section title="Períodos (registros de origem)">
        {sum.members.map((m) => {
          const t = temporalSituation(m.range, vig, m.dateUndetermined)
          return (
            <button key={m.id} className="block w-full rounded-md border px-2.5 py-2 text-left text-[12px] hover:bg-muted" onClick={() => st.select([m.id])}>
              <div className="flex items-center justify-between gap-2">
                <b>{fmtDate(m.start, "month")} – {fmtDate(m.end, "month")}</b>
                <Chip className={m.certainty === "planejado" || m.certainty === "hipotese" ? "border-navy/40 text-navy" : "text-muted-foreground"}>{CERTAINTY_LABEL[m.certainty]}</Chip>
              </div>
              <div className="text-muted-foreground">
                {m.students != null ? `${m.students} bolsistas` : "bolsistas não informados"} · {TEMPORAL_LABEL[t.key]}
              </div>
              <div className="text-muted-foreground">Parceiro: {m.partner ?? "não informado"} · Contrato: {CERTAINTY_LABEL[m.contractStatus ?? "nao_informado"]}</div>
              <div className="text-muted-foreground">Financeiro: {FIN_LABEL[m.finSituation ?? "pendente"]} · Valores: {m.finance?.planned != null || m.finance?.paid != null ? "registrados" : "não informados"}</div>
            </button>
          )
        })}
        <div className="text-[11px] text-muted-foreground">Fontes: {[...new Set(sum.members.flatMap((m) => m.sourceIds))].map((s) => doc.sources.find((x) => x.id === s)?.title ?? s).join("; ") || "—"}</div>
      </V6Section>
    </>
  )
}

export function RevisionsSection({ it }: { it: EffItem }) {
  if (!it.revisions?.length) return null
  return (
    <div>
      <Lbl>Histórico do registro</Lbl>
      {it.revisions.map((r, i) => (
        <div key={i} className="rounded-md border border-dashed px-2.5 py-1.5 text-[11.5px] leading-snug">
          <b>{fmtDate(r.at)}</b> · {r.field === "start" ? "início" : "fim"}: {fmtDate(r.from)} → {fmtDate(r.to)}
          <div className="text-muted-foreground">{r.note}</div>
        </div>
      ))}
    </div>
  )
}

