import { useEffect, useState } from "react"
import { AlertTriangle, Crosshair, Copy, Lock, RotateCcw, Trash2, Unlock } from "lucide-react"
import { Button, Chip } from "@/components/ui/button"
import { calendarMonthsTouched, fmtDate, fromDay, fmtMonthsSpan, isValidISO, lengthDays, rangeOf } from "@/lib/dates"
import { describeAfter, type EffItem } from "@/lib/analysis"
import { brl, itemColor } from "@/lib/visual"
import { CERTAINTY_LABEL, KIND_LABEL, LAYERS, type Annotation, type Certainty, type Item, type ItemKind } from "@/data/types"
import { useStudio } from "@/store/store"
import { useAnalysis, useActiveScenario } from "@/store/hooks"
import { useView } from "@/store/view"

const CERTAINTIES = Object.keys(CERTAINTY_LABEL) as Certainty[]

export function PropertiesPanel() {
  const selection = useStudio((s) => s.selection)
  const selAnn = useStudio((s) => s.selectedAnnotation)
  const doc = useStudio((s) => s.doc)
  const { items, indicators } = useAnalysis()
  const sel = items.filter((i) => selection.includes(i.id))
  const ann = doc.annotations.find((a) => a.id === selAnn)

  return (
    <aside className="scroll-thin flex w-[300px] shrink-0 flex-col overflow-y-auto border-l bg-panel">
      {ann ? (
        <AnnotationProps a={ann} items={items} />
      ) : sel.length === 1 ? (
        <ItemProps key={sel[0].id} it={sel[0]} />
      ) : sel.length > 1 ? (
        <Multi items={sel} />
      ) : (
        <Overview indicators={indicators} />
      )}
    </aside>
  )
}

function Section({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="border-b px-4 py-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[10.5px] font-bold tracking-[0.14em] text-muted-foreground uppercase">{title}</h3>
        {aside}
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  )
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] text-muted-foreground">{label}</span>
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
        <p className="rounded-md border border-[#FFD08A]/30 bg-[#FFD08A]/8 p-2 text-[11px] leading-snug text-[#FFE2B3]">
          Datas específicas não comprovadas: o período mostra apenas o intervalo geral em que a ação ocorreu.
        </p>
      )}
    </>
  )
}

function ItemProps({ it }: { it: EffItem }) {
  const st = useStudio()
  const doc = useStudio((s) => s.doc)
  const scenario = useActiveScenario()
  const { overruns, items } = useAnalysis()
  const over = overruns.find((o) => o.item.id === it.id)
  const overByVig = it.kind === "vigencia" ? overruns.filter((o) => o.vigencia.id === it.id) : []
  const patch = (p: Partial<Item>, label = "editar propriedade") => st.patchItem(it.id, p, label)
  const baseItem = doc.items.find((i) => i.id === it.id)
  const links = doc.links.filter((l) => l.from === it.id || l.to === it.id)
  const nameOf = (id: string) => items.find((i) => i.id === id)?.name ?? id

  return (
    <>
      <div className="border-b px-4 pt-4 pb-3">
        <div className="mb-1 flex items-center gap-1.5">
          <Chip className="text-muted-foreground">{KIND_LABEL[it.kind]}</Chip>
          <Chip className={it.certainty === "hipotese" ? "border-[#C4B5FD]/50 text-[#C4B5FD]" : "text-[#FFE2B3]"}>{CERTAINTY_LABEL[it.certainty]}</Chip>
          {it.changed && <Chip className="border-[#C4B5FD]/50 text-[#C4B5FD]">Δ cenário</Chip>}
        </div>
        <TextField value={it.name} onCommit={(v) => patch({ name: v }, "renomear")} />
        <div className="mt-2 flex gap-1">
          <Button size="sm" variant="ghost" title="Centralizar" onClick={() => useView.getState().centerOn(it.range.start, it.range.end)}><Crosshair className="size-3.5" /></Button>
          <Button size="sm" variant="ghost" title="Duplicar (Ctrl+D)" onClick={() => st.duplicateItems([it.id])}><Copy className="size-3.5" /></Button>
          <Button size="sm" variant="ghost" title={it.locked ? "Desbloquear" : "Bloquear"} onClick={() => st.commit(it.locked ? "desbloquear" : "bloquear", (d) => ({ ...d, items: d.items.map((x) => (x.id === it.id ? { ...x, locked: !it.locked } : x)) }))}>
            {it.locked ? <Unlock className="size-3.5" /> : <Lock className="size-3.5" />}
          </Button>
          <Button size="sm" variant="danger" className="ml-auto" title="Excluir" onClick={() => window.confirm(`Excluir “${it.name}”? (é possível desfazer)`) && st.deleteItems([it.id])}>
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>

      {(over || overByVig.length > 0) && (
        <Section title="Continuidade temporal">
          {over && (
            <div className="rounded-lg border border-accent/50 bg-accent/10 p-2.5 text-[12px] leading-snug">
              <div className="mb-1 flex items-center gap-1.5 font-semibold text-accent"><AlertTriangle className="size-3.5" /> {describeAfter(over)}</div>
              após o fim de “{over.vigencia.name}” ({fmtDate(over.vigencia.end)}). {over.days} dias.
            </div>
          )}
          {overByVig.map((o) => (
            <div key={o.item.id} className="flex justify-between gap-2 text-[11.5px]">
              <span className="truncate">{o.item.name}</span>
              <span className="shrink-0 font-semibold text-accent">+{o.months} m</span>
            </div>
          ))}
          <p className="text-[10.5px] leading-snug text-muted-foreground">Indicador temporal. Não indica despesa irregular, ausência de cobertura financeira nem conclusão jurídica.</p>
        </Section>
      )}

      <Section title="Período">
        <DateRangeFields it={it} />
        {it.baseRange && baseItem && (
          <div className="rounded-md border border-[#C4B5FD]/40 bg-[#C4B5FD]/8 p-2 text-[11px] leading-snug">
            <div className="font-semibold text-[#C4B5FD]">Hipótese em “{scenario.name}”</div>
            Base: {fmtDate(baseItem.start)} – {fmtDate(baseItem.end)}. Esta mudança não altera o registro documental.
            <button
              className="mt-1 flex items-center gap-1 text-[#C4B5FD] hover:underline"
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
              <RotateCcw className="size-3" /> Reverter à base
            </button>
          </div>
        )}
        {scenario.kind === "baseline" && it.kind === "vigencia" && (
          <p className="text-[10.5px] leading-snug text-muted-foreground">Na linha de base, a vigência é protegida: editar suas datas cria automaticamente uma hipótese no Cenário de trabalho.</p>
        )}
      </Section>

      <Section title="Classificação">
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
          <Field label="Status de execução">
            <select className="field" value={it.certainty} onChange={(e) => patch({ certainty: e.target.value as Certainty }, "status")}>
              {CERTAINTIES.map((c) => <option key={c} value={c}>{CERTAINTY_LABEL[c]}</option>)}
            </select>
          </Field>
          <Field label="Status contratual">
            <select className="field" value={it.contractStatus ?? "nao_informado"} onChange={(e) => patch({ contractStatus: e.target.value as Certainty }, "status contratual")}>
              {CERTAINTIES.map((c) => <option key={c} value={c}>{CERTAINTY_LABEL[c]}</option>)}
            </select>
          </Field>
          <Field label="Camada">
            <select className="field" value={it.layer} onChange={(e) => patch({ layer: e.target.value as Item["layer"] }, "camada")}>
              {LAYERS.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
            </select>
          </Field>
          <Field label="Faixa">
            <input type="number" min={0} className="field" value={it.lane} onChange={(e) => patch({ lane: Math.max(0, Number(e.target.value) || 0) }, "faixa")} />
          </Field>
          <Field label="Cor">
            <div className="flex items-center gap-2">
              <input type="color" className="h-7 w-10 cursor-pointer rounded border bg-transparent" value={itemColor(it.kind, doc.projects.find((p) => p.id === it.projectId)?.color ?? "#7C8DB5", it.color)} onFocus={() => st.begin("cor")} onBlur={() => st.end()} onChange={(e) => st.livePatchItems({ [it.id]: { color: e.target.value } })} />
              {it.color && <button className="text-[11px] text-primary" onClick={() => patch({ color: undefined }, "cor")}>padrão</button>}
            </div>
          </Field>
          <Field label="Visível">
            <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={!it.hidden} onChange={() => patch({ hidden: !it.hidden }, "visibilidade")} /> no canvas</label>
          </Field>
        </div>
      </Section>

      {(it.finance || ["curso", "bolsa", "contrato", "projeto", "turma"].includes(it.kind)) && (
        <Section title="Informações financeiras">
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
            <p className="text-[11px] leading-snug text-[#FFE2B3]">{brl(it.finance.planned)} — valor não conciliado; não exibido como oficial.</p>
          )}
          {it.finance?.note && <p className="text-[11px] leading-snug text-muted-foreground">{it.finance.note}</p>}
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
      )}

      <Section title="Vínculos">
        {links.length === 0 && <p className="text-[11px] text-muted-foreground">Sem conexões. Use a ferramenta Conectar (C).</p>}
        {links.map((l) => (
          <div key={l.id} className="flex items-center justify-between gap-2 text-[11.5px]">
            <span className="truncate">{l.from === it.id ? `→ ${nameOf(l.to)}` : `← ${nameOf(l.from)}`}</span>
            <button className="text-muted-foreground hover:text-destructive" onClick={() => st.deleteLink(l.id)}><Trash2 className="size-3" /></button>
          </div>
        ))}
      </Section>

      <Section title="Fonte documental">
        {doc.sources.map((s) => {
          const on = it.sourceIds.includes(s.id)
          return (
            <label key={s.id} className="flex items-start gap-2 text-[11.5px] leading-snug">
              <input type="checkbox" className="mt-0.5" checked={on} onChange={() => patch({ sourceIds: on ? it.sourceIds.filter((x) => x !== s.id) : [...it.sourceIds, s.id] }, "fonte")} />
              <span>
                {s.title} <span className="text-muted-foreground">· {CERTAINTY_LABEL[s.status]}</span>
              </span>
            </label>
          )
        })}
      </Section>

      <Section title="Observações">
        {it.description && <p className="text-[11.5px] leading-snug text-muted-foreground">{it.description}</p>}
        <TextField multiline value={it.notes ?? ""} placeholder="Observações, pendências, referências…" onCommit={(v) => patch({ notes: v }, "observações")} />
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
        <Button size="sm" variant="danger" onClick={() => window.confirm(`Excluir ${items.length} elementos? (é possível desfazer)`) && st.deleteItems(items.map((i) => i.id))}>
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

function Overview({ indicators }: { indicators: ReturnType<typeof useAnalysis>["indicators"] }) {
  const scenario = useActiveScenario()
  return (
    <>
      <Section title="Cenário ativo">
        <div className="text-[13px] font-semibold">{scenario.name}</div>
        <p className="text-[11.5px] leading-snug text-muted-foreground">{scenario.description}</p>
      </Section>
      <Section title="Continuidade após vigência">
        {indicators.overruns.length === 0 && <p className="text-[11.5px] text-muted-foreground">Nenhum registro datado ultrapassa a vigência neste cenário.</p>}
        {indicators.overruns.map((o) => (
          <div key={o.item.id} className="rounded-md border border-accent/30 bg-accent/5 p-2 text-[11.5px] leading-snug">
            <div className="font-semibold">{o.item.name}</div>
            <div className="text-accent">{describeAfter(o)}</div>
          </div>
        ))}
      </Section>
      <Section title="Como editar">
        <ul className="space-y-1.5 text-[11.5px] leading-snug text-muted-foreground">
          <li><b className="text-foreground">Arrastar</b> uma barra muda as datas (duração constante).</li>
          <li><b className="text-foreground">Bordas</b> esquerda/direita redimensionam início/fim.</li>
          <li><b className="text-foreground">Vertical</b> muda só a faixa visual.</li>
          <li><b className="text-foreground">Duplo clique</b> abre o formulário de datas.</li>
          <li><b className="text-foreground">Shift + arrastar</b> no fundo seleciona em área.</li>
          <li><b className="text-foreground">Fundo / Espaço + arrastar</b> navega; <b className="text-foreground">Ctrl + roda</b> aplica zoom.</li>
          <li><b className="text-foreground">Ctrl+Z / Ctrl+Shift+Z</b> desfaz/refaz; Ctrl+C/V/D; Del exclui.</li>
        </ul>
      </Section>
    </>
  )
}
