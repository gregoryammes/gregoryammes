import { dayOf, toDay, ymd } from "@/lib/dates"
import { CERTAINTY_LABEL, type Certainty } from "@/data/types"
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
        hyp ? "border-dashed border-[#C4B5FD] text-[#E4DCFF]" : doc ? "border-[#7FD1FF] bg-[#7FD1FF]/15 text-white" : "border-[#FFD08A]/70 text-[#FFE2B3]",
        className,
      )}
    >
      {hyp ? "◌" : doc ? "●" : "!"} {CERTAINTY_LABEL[c]}
    </span>
  )
}

export function Hatch({ id, color = "#FF7A1A", opacity = 0.9, size = 12 }: { id: string; color?: string; opacity?: number; size?: number }) {
  return (
    <pattern id={id} patternUnits="userSpaceOnUse" width={size} height={size} patternTransform="rotate(45)">
      <rect width={size} height={size} fill={color} fillOpacity={0.16} />
      <line x1="0" y1="0" x2="0" y2={size} stroke={color} strokeWidth={size * 0.32} strokeOpacity={opacity} />
    </pattern>
  )
}
