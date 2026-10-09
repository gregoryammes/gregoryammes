import { useEffect, useState } from "react"
import { Crosshair, Copy, Lock, RotateCcw, Trash2, Unlock, X } from "lucide-react"
import { Button, Chip } from "@/components/ui/button"
import { calendarMonthsTouched, fmtDate, fromDay, fmtMonthsSpan, isValidISO, lengthDays, partAfter, rangeOf, toDay } from "@/lib/dates"
import type { EffItem } from "@/lib/analysis"
import { brl, itemColor, statusOf } from "@/lib/visual"
import { CERTAINTY_LABEL, GROUPS, KIND_LABEL, groupOf, isDetail, layerFor, type Annotation, type Certainty, type GroupId, type Item, type ItemKind } from "@/data/types"
import { useStudio } from "@/store/store"
import { confirmAction } from "@/components/Confirm"
import { useAnalysis, useActiveScenario } from "@/store/hooks"
import { useView } from "@/store/view"

const CERTAINTIES = Object.keys(CERTAINTY_LABEL) as Certainty[]

/**
 * Right drawer. Closed when nothing is selected, so the schedule keeps the space; selecting a bar
 * or a row opens it, and closing it clears the selection.
 */
export function PropertiesPanel() {
  const selection = useStudio((s) => s.selection)
  const selAnn = useStudio((s) => s.selectedAnnotation)
  const doc = useStudio((s) => s.doc)
  const { items } = useAnalysis()
  const sel = items.filter((i) => selection.includes(i.id))
  const ann = doc.annotations.find((a) => a.id === selAnn)
  if (!ann && sel.length === 0) return null
  const close = () => useStudio.setState({ selection: [], selectedAnnotation: null })
  return (
    <aside aria-label="Propriedades" className="scroll-thin absolute inset-y-0 right-0 z-30 flex w-[312px] flex-col overflow-y-auto border-l bg-white shadow-[-12px_0_32px_-24px_rgba(15,40,70,0.35)] lg:static lg:shadow-none">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-4 py-2.5">
        <span className="text-[12px] font-semibold text-muted-foreground">{ann ? "Anotação" : sel.length > 1 ? `${sel.length} selecionados` : "Propriedades"}</span>
        <button aria-label="Fechar painel" title="Fechar (Esc)" className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" onClick={close}>
          <X className="size-4" />
        </button>
      </div>
      {ann ? <AnnotationProps a={ann} items={items} /> : sel.length === 1 ? <ItemProps key={sel[0].id} it={sel[0]} /> : <Multi items={sel} />}
    </aside>
  )
}

function Section({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="border-b px-4 py-3.5">
      <div className="mb-2.5 flex items-center justify-between">
        <h3 className="text-[11px] font-bold tracking-[0.1em] text-navy uppercase">{title}</h3>
        {aside}
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  )
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11.5px] font-medium text-muted-foreground">{label}</span>
      {children}
      {hint && <span className="mt-0.5 block text-[10.5px] text-muted-foreground/80">{hint}</span>}
    </label>
  )
}

/** Text that commits on blur/Enter, so typing doesn't flood the undo history. */
function TextField({ value, onCommit, multiline, placeholder }: { value: string; onCommit: (v: string) => void; multiline?: boolean; placeholder?: string }) {
  const [v, setV] = useState(value)
  useEffect(() => setV(value), [value])
  const commit = () => v !== value && onCommit(v)
  return multiline ? (
    <textarea className="field min-h-[64px] resize-y" value={v} placeholder={placeholder} onChange={(e) => setV(e.target.value)} onBlur={commit} />
  ) : (
    <input className="field" value={v} placeholder={placeholder} onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />
  )
}

/** Money: empty means "não informado" — never zero. */
function MoneyField({ value, onCommit }: { value: number | null | undefined; onCommit: (v: number | null) => void }) {
  const [v, setV] = useState(value == null ? "" : String(value))
  useEffect(() => setV(value == null ? "" : String(value)), [value])
  return (
    <input
      className="field font-mono"
      placeholder="não informado"
      inputMode="decimal"
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        const t = v.trim().replace(/\./g, "").replace(",", ".")
        const n = t === "" ? null : Number(t)
        if (n !== null && Number.isNaN(n)) return setV(value == null ? "" : String(value))
        if (n !== (value ?? null)) onCommit(n)
      }}
    />
  )
}

export function DateRangeFields({ it }: { it: EffItem }) {
  const st = useStudio()
  const [start, setStart] = useState(it.start)
  const [end, setEnd] = useState(it.end)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    setStart(it.start)
    setEnd(it.end)
  }, [it.start, it.end])
  const isMarco = it.kind === "marco"
  const commit = (s: string, e: string) => {
    if (!isValidISO(s) || !isValidISO(e)) return setErr("Data inválida.")
    if (e < s) return setErr("A data final deve ser igual ou posterior à inicial.")
    setErr(null)
    if (s !== it.start || e !== it.end) st.patchItem(it.id, { start: s, end: e }, "editar datas")
  }
  const r = isValidISO(start) && isValidISO(end) && end >= start ? rangeOf(start, end) : null
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <Field label={isMarco ? "Data" : "Início"}>
          <input type="date" className="field" value={start} disabled={it.locked}
            onChange={(e) => { setStart(e.target.value); if (isMarco) setEnd(e.target.value) }}
            onBlur={() => commit(start, isMarco ? start : end)} />
        </Field>
        {!isMarco && (
          <Field label="Fim (inclusivo)">
            <input type="date" className="field" value={end} disabled={it.locked} onChange={(e) => setEnd(e.target.value)} onBlur={() => commit(start, end)} />
          </Field>
        )}
      </div>
      {err && <p className="text-[11px] text-destructive">{err}</p>}
      {r && !isMarco && (
        <div className="flex flex-wrap gap-1.5 text-[11px]">
          <Chip>{lengthDays(r)} dias</Chip>
          <Chip>{calendarMonthsTouched(r)} meses-calendário</Chip>
          <Chip>{fmtMonthsSpan(r)}</Chip>
        </div>
      )}
      {it.dateUndetermined && (
        <p className="rounded-md border border-[#E3C25C] bg-[#FFF8DB] p-2 text-[11.5px] leading-snug text-[#6B4E00]">
          Datas específicas não comprovadas: o período mostra apenas o intervalo geral em que a ação ocorreu.
        </p>
      )}
    </>
  )
}

const FINANCE_KINDS = ["curso", "bolsa", "contrato", "projeto", "turma"]

function ItemProps({ it }: { it: EffItem }) {
  const st = useStudio()
  const doc = useStudio((s) => s.doc)
  const scenario = useActiveScenario()
  const { items } = useAnalysis()
  const patch = (p: Partial<Item>, label = "editar propriedade") => st.patchItem(it.id, p, label)
  const baseItem = doc.items.find((i) => i.id === it.id)
  const links = doc.links.filter((l) => l.from === it.id || l.to === it.id)
  const nameOf = (id: string) => items.find((i) => i.id === id)?.name ?? id
  const ref = toDay(doc.settings.referenceDate)
  const status = statusOf(it, ref)
  const vig = items.find((i) => i.kind === "vigencia" && i.projectId === (it.projectId ?? "p2")) ?? items.find((i) => i.kind === "vigencia")
  const docVig = vig ? (vig.baseRange ?? vig.range) : null
  const after = docVig && !it.dateUndetermined && !["vigencia", "projeto", "planejamento"].includes(it.kind) ? partAfter(it.range, docVig) : null
  const afterHyp = after && vig?.baseRange ? partAfter(it.range, vig.range) : null
  const showFinance = !!it.finance || FINANCE_KINDS.includes(it.kind)

  return (
    <>
      {/* Identificação */}
      <Section title="Identificação">
        <TextField value={it.name} onCommit={(v) => patch({ name: v }, "renomear")} />
        <div className="flex flex-wrap items-center gap-1.5">
          <Chip className="text-muted-foreground">{KIND_LABEL[it.kind]}</Chip>
          <Chip className={it.certainty === "hipotese" ? "border-navy/40 text-navy" : "text-foreground"}>{status.label}</Chip>
          {status.pending && <Chip className="border-[#E3C25C] bg-[#FFF8DB] text-[#6B4E00]">a validar</Chip>}
          {it.changed && <Chip className="border-navy bg-navy text-white">cenário</Chip>}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Tipo">
            <select className="field" value={it.kind} onChange={(e) => patch({ kind: e.target.value as ItemKind }, "tipo")}>
              {Object.entries(KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          <Field label="Projeto">
            <select className="field" value={it.projectId ?? ""} onChange={(e) => patch({ projectId: e.target.value || null }, "projeto")}>
              <option value="">—</option>
              {doc.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
        </div>
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" title="Centralizar na timeline" onClick={() => useView.getState().centerOn(it.range.start, it.range.end)}><Crosshair className="size-3.5" /> Centralizar</Button>
          <Button size="sm" variant="ghost" title="Duplicar (Ctrl+D)" aria-label="Duplicar" onClick={() => st.duplicateItems([it.id])}><Copy className="size-3.5" /></Button>
          <Button size="sm" variant="ghost" title={it.locked ? "Desbloquear" : "Bloquear edição"} aria-label={it.locked ? "Desbloquear" : "Bloquear"} onClick={() => st.commit(it.locked ? "desbloquear" : "bloquear", (d) => ({ ...d, items: d.items.map((x) => (x.id === it.id ? { ...x, locked: !it.locked } : x)) }))}>
            {it.locked ? <Unlock className="size-3.5" /> : <Lock className="size-3.5" />}
          </Button>
          <Button size="sm" variant="danger" className="ml-auto" title="Excluir" aria-label="Excluir" onClick={async () => (await confirmAction(`Excluir “${it.name}”? (é possível desfazer)`)) && st.deleteItems([it.id])}>
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </Section>

      <Section title="Período">
        <DateRangeFields it={it} />
        {after && (
          <div className="rounded-md border border-destructive/30 bg-[#FDF2F2] p-2.5 text-[12px] leading-snug text-foreground">
            <div className="font-semibold text-destructive">{calendarMonthsTouched(after)} meses-calendário após a vigência de referência</div>
            {fmtMonthsSpan(after)} · {lengthDays(after)} dias.
            {vig?.baseRange && <> No cenário ativo: {afterHyp ? `${calendarMonthsTouched(afterHyp)} meses após ${fmtDate(fromDay(vig.range.end - 1))}` : "dentro da vigência simulada"}.</>}
            <div className="mt-1 text-[11px] text-muted-foreground">Fato de calendário: não afirma ausência de pagamento nem de cobertura.</div>
          </div>
        )}
        {it.baseRange && baseItem && (
          <div className="rounded-md border border-navy/30 bg-[#EEF2F8] p-2.5 text-[11.5px] leading-snug">
            <div className="font-semibold text-navy">Hipótese em “{scenario.name}”</div>
            Referência documental: {fmtDate(baseItem.start)} – {fmtDate(baseItem.end)}. O registro documental não foi alterado.
            <button
              className="mt-1 flex items-center gap-1 font-medium text-navy hover:underline"
              onClick={() =>
                st.commit("reverter à base", (d) => ({
                  ...d,
                  scenarios: d.scenarios.map((s) => {
                    if (s.id !== scenario.id) return s
                    const o = { ...s.overrides }
                    delete o[it.id]
                    return { ...s, overrides: o }
                  }),
                }))
              }
            >
              <RotateCcw className="size-3" /> Reverter à referência
            </button>
          </div>
        )}
        {scenario.kind === "baseline" && it.kind === "vigencia" && (
          <p className="text-[11px] leading-snug text-muted-foreground">Na linha de base a vigência é protegida: alterar suas datas cria uma hipótese no Cenário de trabalho.</p>
        )}
      </Section>

      <Section title="Classificação">
        <div className="grid grid-cols-2 gap-2">
          <Field label="Grupo">
            <select
              className="field"
              value={groupOf(it)}
              onChange={(e) => {
                const g = e.target.value as GroupId
                const lane = Math.max(-1, ...items.filter((x) => groupOf(x) === g).map((x) => x.lane)) + 1
                patch({ layer: layerFor(it.kind, g), lane }, "mover de grupo")
              }}
            >
              {GROUPS.map((g) => <option key={g.id} value={g.id}>{g.code} · {g.label}</option>)}
            </select>
          </Field>
          <Field label="Cor">
            <div className="flex items-center gap-2">
              <input type="color" className="h-8 w-10 cursor-pointer rounded border bg-white" value={itemColor(it.kind, doc.projects.find((p) => p.id === it.projectId)?.color ?? "#7C8DA6", it.color)} onFocus={() => st.begin("cor")} onBlur={() => st.end()} onChange={(e) => st.livePatchItems({ [it.id]: { color: e.target.value } })} />
              {it.color && <button className="text-[11px] text-primary" onClick={() => patch({ color: undefined }, "cor")}>padrão</button>}
            </div>
          </Field>
        </div>
        <label className="flex items-center gap-2 text-[12px]"><input type="checkbox" checked={!it.hidden} onChange={() => patch({ hidden: !it.hidden }, "visibilidade")} /> Visível na timeline</label>
        <label className="flex items-center gap-2 text-[12px]"><input type="checkbox" checked={!isDetail(it)} onChange={() => patch({ detail: isDetail(it) ? false : true }, "nível de detalhe")} /> Mostrar na visão limpa</label>
      </Section>

      <Section title="Situação">
        <div className="grid grid-cols-2 gap-2">
          <Field label="Execução / evidência">
            <select className="field" value={it.certainty} onChange={(e) => patch({ certainty: e.target.value as Certainty }, "status")}>
              {CERTAINTIES.map((c) => <option key={c} value={c}>{CERTAINTY_LABEL[c]}</option>)}
            </select>
          </Field>
          <Field label="Contratual">
            <select className="field" value={it.contractStatus ?? "nao_informado"} onChange={(e) => patch({ contractStatus: e.target.value as Certainty }, "status contratual")}>
              {CERTAINTIES.map((c) => <option key={c} value={c}>{CERTAINTY_LABEL[c]}</option>)}
            </select>
          </Field>
        </div>
        {showFinance && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Valor previsto (R$)">
                <MoneyField value={it.finance?.planned} onCommit={(v) => patch({ finance: { planned: v, paid: it.finance?.paid ?? null, status: it.finance?.status ?? "nao_informado", note: it.finance?.note } }, "valor previsto")} />
              </Field>
              <Field label="Valor pago (R$)">
                <MoneyField value={it.finance?.paid} onCommit={(v) => patch({ finance: { planned: it.finance?.planned ?? null, paid: v, status: it.finance?.status ?? "nao_informado", note: it.finance?.note } }, "valor pago")} />
              </Field>
            </div>
            <Field label="Situação financeira">
              <select className="field" value={it.finance?.status ?? "nao_informado"} onChange={(e) => patch({ finance: { planned: it.finance?.planned ?? null, paid: it.finance?.paid ?? null, status: e.target.value as Certainty, note: it.finance?.note } }, "situação financeira")}>
                {CERTAINTIES.map((c) => <option key={c} value={c}>{CERTAINTY_LABEL[c]}</option>)}
              </select>
            </Field>
            {it.finance?.planned != null && it.finance.status !== "comprovado" && it.finance.status !== "formalizado" && (
              <p className="text-[11.5px] leading-snug text-[#6B4E00]">{brl(it.finance.planned)} — valor não conciliado; não exibido como oficial.</p>
            )}
            {it.finance?.note && <p className="text-[11.5px] leading-snug text-muted-foreground">{it.finance.note}</p>}
          </>
        )}
        {it.kind === "bolsa" && (
          <Field label="Condições das bolsas">
            <TextField multiline value={it.conditions ?? ""} onCommit={(v) => patch({ conditions: v }, "condições")} />
          </Field>
        )}
        {(it.kind === "curso" || it.kind === "turma") && (
          <Field label="Quantidade de alunos" hint="Somente quando comprovada. Vazio = não informado.">
            <MoneyField value={it.students} onCommit={(v) => patch({ students: v }, "alunos")} />
          </Field>
        )}
      </Section>

      <Section title="Vínculos">
        {links.length === 0 && <p className="text-[11.5px] text-muted-foreground">Sem conexões. Use a ferramenta Conectar (C) na barra flutuante.</p>}
        {links.map((l) => (
          <div key={l.id} className="flex items-center justify-between gap-2 text-[12px]">
            <span className="truncate">{l.from === it.id ? `→ ${nameOf(l.to)}` : `← ${nameOf(l.from)}`}</span>
            <button aria-label="Remover conexão" className="text-muted-foreground hover:text-destructive" onClick={() => st.deleteLink(l.id)}><Trash2 className="size-3" /></button>
          </div>
        ))}
      </Section>

      <Section title="Fonte documental">
        {doc.sources.map((s) => {
          const on = it.sourceIds.includes(s.id)
          return (
            <label key={s.id} className="flex items-start gap-2 text-[12px] leading-snug">
              <input type="checkbox" className="mt-0.5" checked={on} onChange={() => patch({ sourceIds: on ? it.sourceIds.filter((x) => x !== s.id) : [...it.sourceIds, s.id] }, "fonte")} />
              <span>
                {s.title} <span className="text-muted-foreground">· {CERTAINTY_LABEL[s.status]}</span>
              </span>
            </label>
          )
        })}
        {it.description && <p className="pt-1 text-[11.5px] leading-snug text-muted-foreground">{it.description}</p>}
        <Field label="Observações">
          <TextField multiline value={it.notes ?? ""} placeholder="Observações, pendências, referências…" onCommit={(v) => patch({ notes: v }, "observações")} />
        </Field>
      </Section>
    </>
  )
}

function Multi({ items }: { items: EffItem[] }) {
  const st = useStudio()
  return (
    <Section title={`${items.length} elementos selecionados`}>
      <ul className="space-y-1 text-[12px]">{items.map((i) => <li key={i.id} className="truncate">• {i.name}</li>)}</ul>
      <p className="text-[11px] text-muted-foreground">Arraste qualquer barra para deslocar o grupo mantendo as durações. ←/→ desloca por unidade de encaixe.</p>
      <div className="flex gap-1">
        <Button size="sm" onClick={() => st.duplicateItems(items.map((i) => i.id))}><Copy className="size-3" /> Duplicar</Button>
        <Button size="sm" variant="danger" onClick={async () => (await confirmAction(`Excluir ${items.length} elementos? (é possível desfazer)`)) && st.deleteItems(items.map((i) => i.id))}>
          <Trash2 className="size-3" /> Excluir
        </Button>
      </div>
    </Section>
  )
}

function AnnotationProps({ a, items }: { a: Annotation; items: EffItem[] }) {
  const st = useStudio()
  return (
    <>
      <Section title="Anotação">
        <Field label="Texto">
          <TextField multiline value={a.text} onCommit={(v) => st.patchAnnotation(a.id, { text: v })} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Estilo">
            <select className="field" value={a.kind} onChange={(e) => st.patchAnnotation(a.id, { kind: e.target.value as Annotation["kind"] })}>
              <option value="note">Nota</option>
              <option value="callout">Caixa explicativa</option>
              <option value="comment">Comentário</option>
              <option value="marker">Marcador</option>
              <option value="highlight">Destaque (faixa)</option>
            </select>
          </Field>
          <Field label={a.kind === "highlight" ? "Largura (dias)" : "Largura (px)"}>
            <input type="number" className="field" value={a.width ?? (a.kind === "highlight" ? 90 : 200)} onChange={(e) => st.patchAnnotation(a.id, { width: Number(e.target.value) || undefined })} />
          </Field>
        </div>
        <Field label="Vinculada a" hint="Vinculada, a anotação acompanha o elemento quando suas datas mudam.">
          <select
            className="field"
            value={a.linkedItemId ?? ""}
            onChange={(e) => {
              const target = items.find((i) => i.id === e.target.value)
              if (!target) {
                const linked = items.find((i) => i.id === a.linkedItemId)
                const day = linked ? linked.range.start + (a.offsetDays ?? 0) : null
                st.patchAnnotation(a.id, { linkedItemId: null, ...(day != null ? { date: fromDay(day), y: 0 } : {}) })
              } else st.patchAnnotation(a.id, { linkedItemId: target.id, offsetDays: Math.round((target.range.end - target.range.start) / 2), y: -44 })
            }}
          >
            <option value="">— livre —</option>
            {items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
        </Field>
        <Button size="sm" variant="danger" onClick={() => st.deleteAnnotation(a.id)}><Trash2 className="size-3" /> Excluir anotação</Button>
      </Section>
    </>
  )
}

