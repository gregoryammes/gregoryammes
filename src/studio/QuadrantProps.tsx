import { useEffect, useState } from "react"
import { ArrowDown, ArrowUp, Copy, Eye, EyeOff, Lock, Trash2, Unlock } from "lucide-react"
import { Button, Chip } from "@/components/ui/button"
import { confirmAction } from "@/components/Confirm"
import { fmtDate, fromDay, isValidISO } from "@/lib/dates"
import { describeRule, quadrantRange, RULE_LABEL } from "@/lib/quadrants"
import type { Quadrant, QuadrantRule } from "@/data/types"
import { useStudio } from "@/store/store"
import { useEffectiveItems } from "@/store/hooks"
import { useView } from "@/store/view"
import { deleteQuadrant, duplicateQuadrant, patchQuadrant, shiftLayer, validQuadrant } from "@/store/quadrants"
import { V6Section } from "./PropertiesV6"

const Lbl = ({ children }: { children: React.ReactNode }) => <span className="mb-1 block text-[11.5px] font-medium text-muted-foreground">{children}</span>

export const QUAD_COLORS = [
  { c: "#F28C28", n: "Laranja (após a vigência)" },
  { c: "#8870B5", n: "Roxo (Projeto 3)" },
  { c: "#127BAF", n: "Azul (Projeto 2)" },
  { c: "#19885D", n: "Verde (Projeto 1)" },
  { c: "#64748B", n: "Cinza (transição)" },
  { c: "#C2410C", n: "Telha (marco)" },
]

function Text({ value, onCommit, label, multiline }: { value: string; onCommit: (v: string) => void; label: string; multiline?: boolean }) {
  const [v, setV] = useState(value)
  useEffect(() => setV(value), [value])
  return multiline ? (
    <textarea aria-label={label} className="field min-h-[52px]" value={v} onChange={(e) => setV(e.target.value)} onBlur={() => v !== value && onCommit(v)} />
  ) : (
    <input aria-label={label} className="field" value={v} onChange={(e) => setV(e.target.value)} onBlur={() => v !== value && onCommit(v)} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />
  )
}

/** Start and end edited together, committed on blur / Enter — typing a year never saves "0002". */
function QuadDates({ q, disabled, onCommit }: { q: Quadrant; disabled?: boolean; onCommit: (start: string, end: string) => void }) {
  const [a, setA] = useState(q.start)
  const [b, setB] = useState(q.end)
  // Each field follows only its own value: saving the start never resets an end being typed.
  useEffect(() => setA(q.start), [q.start])
  useEffect(() => setB(q.end), [q.end])
  const commit = () => {
    if (!isValidISO(a) || !isValidISO(b)) {
      setA(q.start)
      setB(q.end)
      return
    }
    if (a !== q.start || b !== q.end) onCommit(a, b)
  }
  const key = (e: React.KeyboardEvent<HTMLInputElement>) => e.key === "Enter" && (e.target as HTMLInputElement).blur()
  return (
    <div className="grid grid-cols-2 gap-2">
      <label className="block"><Lbl>Início</Lbl>
        <input aria-label="Início do quadrante" type="date" className="field" value={a} disabled={disabled} onChange={(e) => setA(e.target.value)} onBlur={commit} onKeyDown={key} />
      </label>
      <label className="block"><Lbl>Fim (inclusivo)</Lbl>
        <input aria-label="Fim do quadrante" type="date" className="field" value={b} disabled={disabled} onChange={(e) => setB(e.target.value)} onBlur={commit} onKeyDown={key} />
      </label>
    </div>
  )
}

/** Quadrant panel. Every field is visual: contracts, dates of records and values are never touched. */
export function QuadrantProps({ q }: { q: Quadrant }) {
  const st = useStudio()
  const doc = useStudio((s) => s.doc)
  const items = useEffectiveItems()
  const rows = useView((s) => s.rowIndex)
  const [err, setErr] = useState<string | null>(null)
  const range = quadrantRange(q, items)
  const patch = (p: Partial<Quadrant>, label = "editar quadrante") => {
    const e = validQuadrant({ ...q, ...p })
    if (e) return setErr(e)
    setErr(null)
    st.commit(label, (d) => patchQuadrant(d, q.id, p))
  }
  const lockedPlace = !!q.locked
  // Anchors that the current layout does not list (e.g. a row hidden by a filter) stay visible as such.
  const known = new Set(rows.map((r) => r.key))
  const live = (p: Partial<Quadrant>) => st.live((d) => patchQuadrant(d, q.id, p))
  const projects = doc.projects
  const setRule = (rule: QuadrantRule) => patch({ mode: "auto", rule }, "regra do quadrante")
  return (
    <>
      <V6Section title="Quadrante">
        <Text label="Título do quadrante" value={q.title} onCommit={(v) => v.trim() && patch({ title: v.trim() }, "título do quadrante")} />
        <Text label="Descrição do quadrante" multiline value={q.description ?? ""} onCommit={(v) => patch({ description: v || undefined }, "descrição do quadrante")} />
        <div className="flex flex-wrap gap-1">
          <Chip>{q.mode === "auto" ? "automático" : "manual"}</Chip>
          {q.locked && <Chip>bloqueado</Chip>}
          {q.hidden && <Chip>oculto</Chip>}
          <Chip className="text-muted-foreground">{range ? `${fmtDate(fromDay(range.start))} – ${fmtDate(fromDay(range.end - 1))}` : "sem período no cenário"}</Chip>
        </div>
        <p className="text-[11px] leading-snug text-muted-foreground">Destaque visual: mover, recolorir ou excluir um quadrante não altera contratos, datas oficiais nem valores.</p>
      </V6Section>

      <V6Section title="Período">
        <div className="flex gap-1">
          <Button size="sm" variant="outline" active={q.mode === "manual"} disabled={lockedPlace} onClick={() => patch({ mode: "manual", ...(range ? { start: fromDay(range.start), end: fromDay(range.end - 1) } : {}) }, "quadrante manual")}>Manual</Button>
          <Button size="sm" variant="outline" active={q.mode === "auto"} disabled={lockedPlace} onClick={() => setRule(q.rule ?? { kind: "after_vigencia", projectId: "p2" })}>Automático</Button>
        </div>
        {q.mode === "auto" ? (
          <>
            <label className="block"><Lbl>Regra</Lbl>
              <select aria-label="Regra do quadrante" className="field" disabled={lockedPlace} value={q.rule?.kind ?? "after_vigencia"}
                onChange={(e) => {
                  const k = e.target.value as QuadrantRule["kind"]
                  setRule(k === "between_projects" ? { kind: k, fromProjectId: "p2", toProjectId: "p3" } : { kind: k, projectId: q.rule && "projectId" in q.rule ? q.rule.projectId : "p2" })
                }}>
                {(Object.keys(RULE_LABEL) as QuadrantRule["kind"][]).map((k) => <option key={k} value={k}>{RULE_LABEL[k]}</option>)}
              </select>
            </label>
            {q.rule && q.rule.kind !== "between_projects" && (
              <label className="block"><Lbl>Projeto</Lbl>
                <select aria-label="Projeto da regra" className="field" disabled={lockedPlace} value={q.rule.projectId} onChange={(e) => setRule({ ...(q.rule as { kind: "after_vigencia" | "project_period"; projectId: string }), projectId: e.target.value })}>
                  {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
            )}
            {q.rule?.kind === "between_projects" && (
              <div className="grid grid-cols-2 gap-2">
                <label className="block"><Lbl>De</Lbl>
                  <select aria-label="Projeto de origem" className="field" disabled={lockedPlace} value={q.rule.fromProjectId} onChange={(e) => setRule({ kind: "between_projects", fromProjectId: e.target.value, toProjectId: (q.rule as { toProjectId: string }).toProjectId })}>
                    {projects.map((p) => <option key={p.id} value={p.id}>{p.short}</option>)}
                  </select>
                </label>
                <label className="block"><Lbl>Para</Lbl>
                  <select aria-label="Projeto de destino" className="field" disabled={lockedPlace} value={q.rule.toProjectId} onChange={(e) => setRule({ kind: "between_projects", fromProjectId: (q.rule as { fromProjectId: string }).fromProjectId, toProjectId: e.target.value })}>
                    {projects.map((p) => <option key={p.id} value={p.id}>{p.short}</option>)}
                  </select>
                </label>
              </div>
            )}
            {q.rule && <p className="text-[11.5px] leading-snug text-muted-foreground">{describeRule(q.rule, doc)}. Segue o cenário ativo{range ? "" : " — neste cenário a regra não produz período, e o quadrante não aparece"}.</p>}
          </>
        ) : (
          <QuadDates q={q} disabled={lockedPlace} onCommit={(start, end) => patch({ start, end }, "período do quadrante")} />
        )}
        <div className="grid grid-cols-2 gap-2">
          <label className="block"><Lbl>Linha inicial</Lbl>
            <select aria-label="Linha inicial do quadrante" className="field" disabled={lockedPlace} value={q.rowFrom ?? ""} onChange={(e) => patch({ rowFrom: e.target.value || null }, "linhas do quadrante")}>
              <option value="">— topo —</option>
              {q.rowFrom && !known.has(q.rowFrom) && <option value={q.rowFrom}>(linha não visível nesta exibição)</option>}
              {rows.map((r) => <option key={r.key} value={r.key}>{r.title}</option>)}
            </select>
          </label>
          <label className="block"><Lbl>Linha final</Lbl>
            <select aria-label="Linha final do quadrante" className="field" disabled={lockedPlace} value={q.rowTo ?? ""} onChange={(e) => patch({ rowTo: e.target.value || null }, "linhas do quadrante")}>
              <option value="">— base —</option>
              {q.rowTo && !known.has(q.rowTo) && <option value={q.rowTo}>(linha não visível nesta exibição)</option>}
              {rows.map((r) => <option key={r.key} value={r.key}>{r.title}</option>)}
            </select>
          </label>
        </div>
        {lockedPlace && <p className="text-[11.5px] text-muted-foreground">Bloqueado: período, linhas e modo ficam fixos até desbloquear.</p>}
        {err && <p className="text-[11.5px] text-destructive">{err}</p>}
      </V6Section>

      <V6Section title="Aparência">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Cores do quadrante">
          {QUAD_COLORS.map((c) => (
            <button key={c.c} title={c.n} aria-label={`Cor ${c.n}`} onClick={() => patch({ color: c.c, strokeColor: c.c }, "cor do quadrante")}
              className={`size-6 rounded-md border-2 ${q.color.toLowerCase() === c.c.toLowerCase() ? "border-foreground" : "border-transparent"}`} style={{ background: c.c }} />
          ))}
          <input type="color" aria-label="Cor personalizada do quadrante" className="h-6 w-8 cursor-pointer rounded border bg-white" value={q.color}
            onFocus={() => st.begin("cor do quadrante")} onBlur={() => st.end()} onChange={(e) => live({ color: e.target.value, strokeColor: e.target.value })} />
        </div>
        <label className="block"><Lbl>Opacidade do fundo · {Math.round(q.opacity * 100)}%</Lbl>
          <input aria-label="Opacidade do quadrante" type="range" min={0} max={0.5} step={0.01} className="w-full" value={q.opacity}
            onPointerDown={() => st.begin("opacidade do quadrante")} onPointerUp={() => st.end()} onKeyUp={() => st.end()} onBlur={() => st.end()}
            onKeyDown={(e) => ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"].includes(e.key) && !useStudio.getState().tx && st.begin("opacidade do quadrante")}
            onChange={(e) => live({ opacity: +e.target.value })} />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block"><Lbl>Contorno</Lbl>
            <select aria-label="Contorno do quadrante" className="field" value={q.stroke} onChange={(e) => patch({ stroke: e.target.value as Quadrant["stroke"] }, "contorno do quadrante")}>
              <option value="none">Sem contorno</option>
              <option value="solid">Sólido</option>
              <option value="dashed">Tracejado</option>
            </select>
          </label>
          <label className="block"><Lbl>Cor do contorno</Lbl>
            <input type="color" aria-label="Cor do contorno do quadrante" className="h-8 w-full cursor-pointer rounded border bg-white" value={q.strokeColor ?? q.color}
              onFocus={() => st.begin("contorno do quadrante")} onBlur={() => st.end()} onChange={(e) => live({ strokeColor: e.target.value })} />
          </label>
        </div>
        <label className="flex items-center gap-2 text-[12px]"><input type="checkbox" checked={q.showTitle !== false} onChange={() => patch({ showTitle: q.showTitle === false }, "título do quadrante")} /> Mostrar título no canvas</label>
      </V6Section>

      <V6Section title="Camada e ações">
        <div className="flex flex-wrap gap-1">
          <Button size="sm" variant="ghost" title="Trazer para frente (continua atrás das barras)" onClick={() => st.commit("camada do quadrante", (d) => shiftLayer(d, q.id, 1))}><ArrowUp className="size-3.5" /> Frente</Button>
          <Button size="sm" variant="ghost" title="Enviar para trás" onClick={() => st.commit("camada do quadrante", (d) => shiftLayer(d, q.id, -1))}><ArrowDown className="size-3.5" /> Trás</Button>
          <Button size="sm" variant="ghost" onClick={() => { let id = ""; st.commit("duplicar quadrante", (d) => { const r = duplicateQuadrant(d, q.id); id = r.id; return r.doc }); if (id) st.selectQuad(id) }}><Copy className="size-3.5" /> Duplicar</Button>
          <Button size="sm" variant="ghost" onClick={() => patch({ hidden: !q.hidden }, q.hidden ? "mostrar quadrante" : "ocultar quadrante")}>{q.hidden ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />} {q.hidden ? "Mostrar" : "Ocultar"}</Button>
          <Button size="sm" variant="ghost" onClick={() => patch({ locked: !q.locked }, q.locked ? "desbloquear quadrante" : "bloquear quadrante")}>{q.locked ? <Unlock className="size-3.5" /> : <Lock className="size-3.5" />} {q.locked ? "Desbloquear" : "Bloquear"}</Button>
        </div>
        <Button size="sm" variant="danger" onClick={async () => {
          if (!(await confirmAction(`Excluir o quadrante “${q.title}”? Só o destaque visual é removido (é possível desfazer).`))) return
          st.commit("excluir quadrante", (d) => deleteQuadrant(d, q.id))
          st.selectQuad(null)
        }}>
          <Trash2 className="size-3" /> Excluir quadrante
        </Button>
      </V6Section>
    </>
  )
}
