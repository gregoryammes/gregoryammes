import { addMonths, dayOf, fmtDate, fromDay, monthShort, toDay, ymd } from "@/lib/dates"
import { CERTAINTY_LABEL, type Certainty } from "@/data/types"
import { C } from "@/lib/visual"
import { cn } from "@/lib/utils"

/** Linear date → stage-x scale. Every board chart uses this; no perspective ever touches it. */
export function stageScale(domainStart: number, domainEnd: number, x: number, w: number) {
  const k = w / (domainEnd - domainStart)
  return { X: (day: number) => x + (day - domainStart) * k, k }
}

export const yearFrac = (day: number) => {
  const { y } = ymd(day)
  const a = dayOf(y, 1)
  return y + (day - a) / (dayOf(y + 1, 1) - a)
}

export const iso = toDay

export function StatusTag({ c, className }: { c: Certainty; className?: string }) {
  const hyp = c === "hipotese"
  const doc = c === "comprovado" || c === "formalizado" || c === "executado"
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border-2 px-3 py-0.5 text-[15px] font-semibold whitespace-nowrap",
        hyp ? "border-dashed border-[#173B63] text-[#173B63]" : doc ? "border-[#23845D] bg-[#23845D]/10 text-[#1B6A4A]" : "border-[#E3C25C] bg-[#FFF8DB] text-[#6B4E00]",
        className,
      )}
    >
      {hyp ? "◌" : doc ? "●" : "!"} {CERTAINTY_LABEL[c]}
    </span>
  )
}

export function Stripes({ id, color = C.after }: { id: string; color?: string }) {
  return (
    <pattern id={id} patternUnits="userSpaceOnUse" width="12" height="12" patternTransform="rotate(45)">
      <rect width="12" height="12" fill={color} />
      <line x1="0" y1="0" x2="0" y2="12" stroke="#FFFFFF" strokeWidth="3" strokeOpacity="0.28" />
    </pattern>
  )
}

/** Year / semester / month header drawn on the stage at presentation scale. */
export function StageAxis({ d0, d1, X, y, months = true, vigEnd }: { d0: number; d1: number; X: (d: number) => number; y: number; months?: boolean; vigEnd?: number | null }) {
  const out: React.ReactNode[] = []
  for (let yy = ymd(d0).y; yy <= ymd(d1 - 1).y; yy++) {
    const a = Math.max(d0, dayOf(yy, 1))
    const b = Math.min(d1, dayOf(yy + 1, 1))
    out.push(
      <g key={`y${yy}`}>
        <rect x={X(a) + 2} y={y} width={X(b) - X(a) - 4} height={40} fill="#E6EBF1" />
        <text x={(X(a) + X(b)) / 2} y={y + 28} fontSize={24} fontWeight={800} fill={C.text} textAnchor="middle">{yy}</text>
      </g>,
    )
    for (const h of [0, 1]) {
      const s = dayOf(yy, h * 6 + 1)
      const e = dayOf(yy, h * 6 + 7)
      if (e <= d0 || s >= d1) continue
      out.push(
        <g key={`s${yy}${h}`}>
          <rect x={X(Math.max(s, d0)) + 2} y={y + 44} width={X(Math.min(e, d1)) - X(Math.max(s, d0)) - 4} height={30} fill="#F1F4F8" />
          <text x={(X(Math.max(s, d0)) + X(Math.min(e, d1))) / 2} y={y + 65} fontSize={17} fontWeight={600} fill={C.text2} textAnchor="middle">{h + 1}º sem</text>
        </g>,
      )
    }
  }
  if (months) {
    for (let d = dayOf(ymd(d0).y, ymd(d0).m); d < d1; d = addMonths(d, 1)) {
      const w = X(addMonths(d, 1)) - X(d)
      const isVig = vigEnd != null && d === vigEnd
      out.push(
        <text key={`m${d}`} x={X(d) + w / 2} y={y + 98} fontSize={14} fontFamily="JetBrains Mono, monospace" textAnchor="middle" fill={isVig ? C.vigLine : C.text3} fontWeight={isVig ? 800 : 500}>
          {monthShort(ymd(d).m)[0].toUpperCase()}
        </text>,
      )
    }
  }
  return <g>{out}</g>
}

export const dmy = (d: number) => fmtDate(fromDay(d))
