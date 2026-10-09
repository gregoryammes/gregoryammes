import type { Row } from "@/lib/layout"
import { paidOf } from "@/lib/finance"
import type { FinRecord } from "@/data/types"

export const FIN_COL_W = 288

/**
 * Financial summary, on demand. Definitions:
 * - Contratado: sum of the contract values registered on the acquisitions.
 * - Pago: sum of realized payment records linked to those acquisitions (each record once).
 * - Saldo: contratado − pago, only for acquisitions where both are informed.
 * Bolsas, materials and forecasts are not added to "Pago"; nothing is inferred from a status.
 */
export function summarize(fins: FinRecord[], actionIds: Set<string>) {
  const acqs = fins.filter((f) => f.kind === "aquisicao" && f.actionId && actionIds.has(f.actionId))
  const seenPay = new Set<string>()
  let contracted: number | null = null
  let paid: number | null = null
  let balance: number | null = null
  let missing = 0
  for (const a of acqs) {
    if (a.contractValue != null) contracted = (contracted ?? 0) + a.contractValue
    else missing++
    const { pays } = paidOf(fins, a)
    let mine: number | null = null
    for (const p of pays) {
      if (seenPay.has(p.id) || p.value == null) continue
      seenPay.add(p.id)
      mine = (mine ?? 0) + p.value
    }
    if (mine != null) paid = (paid ?? 0) + mine
    if (a.contractValue != null && mine != null) balance = (balance ?? 0) + (a.contractValue - mine)
  }
  return { acqs: acqs.length, contracted, paid, balance, missing }
}

const money = (v: number | null) => (v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }))

/** Columns aligned with the timeline rows; scrolls with them. */
export function FinanceColumn({ rows, top, height, scrollY, fins, header }: { rows: Row[]; top: number; height: number; scrollY: number; fins: FinRecord[]; header: number }) {
  const lines: { y: number; h: number; ids: Set<string>; strong?: boolean }[] = []
  for (const r of rows) {
    if (r.type === "lane" && r.kind === "modality" && !r.collapsed) lines.push({ y: r.top, h: r.h, ids: new Set(r.members.map((m) => m.item.id)), strong: true })
    else if (r.type === "item" && r.info && r.depth === 1) lines.push({ y: r.top, h: r.h, ids: new Set([r.item.id]) })
    else if (r.type === "consolidated" && r.info) lines.push({ y: r.top, h: r.h, ids: new Set(r.members.map((m) => m.id)) })
    else if (r.type === "comp" && r.comp === "aquisicao" && r.actionId) lines.push({ y: r.top, h: r.h, ids: new Set([r.actionId]) })
  }
  const all = summarize(fins, new Set(fins.map((f) => f.actionId).filter((x): x is string => !!x)))
  const col = "w-[86px] text-right font-mono"
  return (
    <div role="region" aria-label="Resumo financeiro" className="absolute top-0 right-0 overflow-hidden border-l bg-white text-[11px]" style={{ width: FIN_COL_W, height: top + height }}>
      <div className="border-b px-2.5 pt-2" style={{ height: header }}>
        <div className="flex items-center justify-between font-bold text-navy">
          <span title="Contratado: valores contratados registrados nas aquisições. Pago: pagamentos realizados registrados, cada um uma vez. Saldo: contratado − pago, só quando os dois são informados.">Resumo financeiro ⓘ</span>
          <span className="font-normal text-muted-foreground">{all.acqs} aquisições</span>
        </div>
        <div className="mt-1 flex justify-end gap-1 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
          <span className={col}>Contratado</span><span className={col}>Pago</span><span className={col}>Saldo</span>
        </div>
        <div className="mt-0.5 flex justify-end gap-1 font-semibold text-foreground" aria-label="Totais">
          <span className={col}>{money(all.contracted)}</span><span className={col}>{money(all.paid)}</span><span className={col}>{money(all.balance)}</span>
        </div>
        <p className="mt-1 text-[10px] leading-snug text-muted-foreground">— = não informado. Bolsas e materiais não entram no “pago” da aquisição.</p>
      </div>
      <div className="relative" style={{ height }}>
        {lines.map((l, i) => {
          const s = summarize(fins, l.ids)
          if (!s.acqs) return (
            <div key={i} className="absolute right-0 left-0 flex items-center justify-end px-2.5 text-muted-foreground/70" style={{ top: l.y - scrollY, height: l.h }}>
              <span className="text-[10.5px] italic">sem aquisição registrada</span>
            </div>
          )
          return (
            <div key={i} className={`absolute right-0 left-0 flex items-center justify-end gap-1 px-2.5 ${l.strong ? "font-semibold" : ""}`} style={{ top: l.y - scrollY, height: l.h }} title={s.missing ? `${s.missing} aquisição(ões) sem valor contratado informado` : undefined}>
              <span className={col}>{money(s.contracted)}{s.missing && s.contracted != null ? "*" : ""}</span>
              <span className={col}>{money(s.paid)}</span>
              <span className={col}>{money(s.balance)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
