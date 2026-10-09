import { useState } from "react"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { addMonths, fromDay, isValidISO, startOfMonth, toDay } from "@/lib/dates"
import { CERTAINTY_LABEL, DEFAULT_LAYER, KIND_LABEL, type Certainty, type Item, type ItemKind } from "@/data/types"
import { useStudio, uid } from "@/store/store"
import { useActiveScenario, useEffectiveItems } from "@/store/hooks"
import { useView } from "@/store/view"
import { DateRangeFields } from "./PropertiesPanel"

export function Modal({ title, onClose, children, width = 440 }: { title: string; onClose: () => void; children: React.ReactNode; width?: number }) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-4 backdrop-blur-[2px]" onMouseDown={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} className="rounded-xl border bg-panel-2 shadow-2xl shadow-black/60" style={{ width }} onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-sm font-semibold">{title}</h2>
          <button aria-label="Fechar" className="rounded p-1 text-muted-foreground hover:bg-white/10" onClick={onClose}><X className="size-4" /></button>
        </div>
        <div className="space-y-3 p-4">{children}</div>
      </div>
    </div>
  )
}

export function EditDatesDialog() {
  const id = useStudio((s) => s.editingItemId)
  const setEditing = useStudio((s) => s.setEditing)
  const items = useEffectiveItems()
  const it = items.find((i) => i.id === id)
  if (!it) return null
  return (
    <Modal title={`Editar datas — ${it.name}`} onClose={() => setEditing(null)}>
      <DateRangeFields it={it} />
      <p className="text-[11px] text-muted-foreground">As datas são a fonte de verdade: a barra é reposicionada a partir delas. Saia do campo para aplicar.</p>
      <div className="flex justify-end"><Button variant="primary" onClick={() => setEditing(null)}>Concluir</Button></div>
    </Modal>
  )
}

export function CreateDialog({ kind, onClose }: { kind: ItemKind; onClose: () => void }) {
  const doc = useStudio((s) => s.doc)
  const st = useStudio()
  const scenario = useActiveScenario()
  const items = useEffectiveItems()
  const ref = toDay(doc.settings.referenceDate)
  const [form, setForm] = useState({
    name: kind === "curso" ? "Novo curso" : `Novo(a) ${KIND_LABEL[kind].toLowerCase()}`,
    kind,
    projectId: "p2",
    start: fromDay(startOfMonth(ref)),
    end: kind === "marco" ? fromDay(startOfMonth(ref)) : fromDay(addMonths(startOfMonth(ref), 12) - 1),
    certainty: (scenario.kind === "baseline" ? "a_validar" : "hipotese") as Certainty,
  })
  const [err, setErr] = useState<string | null>(null)
  const set = (p: Partial<typeof form>) => setForm({ ...form, ...p })

  const create = () => {
    if (!form.name.trim()) return setErr("Informe um nome.")
    if (!isValidISO(form.start) || !isValidISO(form.end)) return setErr("Datas inválidas.")
    if (form.end < form.start) return setErr("A data final deve ser igual ou posterior à inicial.")
    const layer = DEFAULT_LAYER[form.kind]
    const lane = Math.max(-1, ...items.filter((i) => i.layer === layer).map((i) => i.lane)) + 1
    const item: Item = {
      id: uid(form.kind),
      name: form.name.trim(),
      kind: form.kind,
      layer,
      lane,
      projectId: form.projectId || null,
      start: form.start,
      end: form.kind === "marco" ? form.start : form.end,
      precision: "day",
      certainty: form.certainty,
      sourceIds: [],
      finance: ["curso", "bolsa", "contrato", "turma"].includes(form.kind) ? { planned: null, paid: null, status: "nao_informado" } : undefined,
    }
    st.addItem(item)
    useView.getState().centerOn(toDay(item.start), toDay(item.end) + 1)
    onClose()
  }

  return (
    <Modal title={`Cadastrar ${KIND_LABEL[form.kind].toLowerCase()}`} onClose={onClose}>
      <label className="block text-[11px] text-muted-foreground">Nome<input autoFocus className="field mt-1" value={form.name} onChange={(e) => set({ name: e.target.value })} onKeyDown={(e) => e.key === "Enter" && create()} /></label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-[11px] text-muted-foreground">Tipo
          <select className="field mt-1" value={form.kind} onChange={(e) => set({ kind: e.target.value as ItemKind })}>
            {Object.entries(KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label className="block text-[11px] text-muted-foreground">Projeto
          <select className="field mt-1" value={form.projectId} onChange={(e) => set({ projectId: e.target.value })}>
            <option value="">—</option>
            {doc.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label className="block text-[11px] text-muted-foreground">Início<input type="date" className="field mt-1" value={form.start} onChange={(e) => set({ start: e.target.value })} /></label>
        {form.kind !== "marco" && (
          <label className="block text-[11px] text-muted-foreground">Fim (inclusivo)<input type="date" className="field mt-1" value={form.end} onChange={(e) => set({ end: e.target.value })} /></label>
        )}
        <label className="col-span-2 block text-[11px] text-muted-foreground">Status
          <select className="field mt-1" value={form.certainty} disabled={scenario.kind !== "baseline"} onChange={(e) => set({ certainty: e.target.value as Certainty })}>
            {Object.entries(CERTAINTY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
      </div>
      {scenario.kind !== "baseline" && <p className="text-[11px] text-[#C4B5FD]">Cenário “{scenario.name}”: o registro existirá só nesta simulação, como hipótese.</p>}
      {err && <p className="text-[11px] text-destructive">{err}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button variant="primary" onClick={create}>Cadastrar</Button>
      </div>
    </Modal>
  )
}
