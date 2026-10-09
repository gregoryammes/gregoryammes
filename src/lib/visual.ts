import type { Certainty, ItemKind } from "@/data/types"

/** Executive Light palette. Identity (project) is colour; status is form. */
export const C = {
  text: "#18324A",
  text2: "#64748B",
  text3: "#8796A8",
  grid: "#DFE6EE",
  gridSoft: "#EDF1F5",
  zebra: "#F6F8FB",
  groupBg: "#EEF3F8",
  white: "#FFFFFF",
  blue: "#087CB8",
  navy: "#173B63",
  green: "#23845D",
  orange: "#F28C28",
  orangeDark: "#A85A10",
  orangeSoft: "#FDEBD8",
  red: "#C83C3C",
  redSoft: "#FDF2F2",
  plan: "#AEBAC8",
  slate: "#7C8DA6",
  amber: "#B7791F",
  selection: "#087CB8",
  /** Documental end of the vigência: a discreet, strong marker. */
  vigLine: "#C2410C",
  /** Continuity after the vigência — temporal attention, not a financial verdict. */
  after: "#EE7F12",
  afterSoft: "#FFF5EA",
  afterText: "#9A4A08",
  /** V8: hypothetical scenario (simulation) — purple, always labelled. */
  scenario: "#6D4AC4",
  scenarioSoft: "#F1ECFB",
  /** Financial event proven as realized. */
  paid: "#23845D",
  paidSoft: "#E7F4EE",
  /** Not realized / not confirmed / planning. */
  muted: "#94A3B8",
}

/** Kept for the presentation scenes. */
export const BRAND = { ...C, orange: C.orange, ref: C.blue, scenario: C.navy }

const KIND_COLOR: Partial<Record<ItemKind, string>> = {
  vigencia: C.navy,
  planejamento: C.plan,
  operacao: C.slate,
  contrato: C.slate,
  marco: C.navy,
}

/** Lighter tint of a hex colour (bolsas use a tint of their project's colour). */
export function tint(hex: string, amount: number) {
  const n = parseInt(hex.slice(1), 16)
  const mix = (c: number) => Math.round(c + (255 - c) * amount)
  const r = mix(n >> 16), g = mix((n >> 8) & 255), b = mix(n & 255)
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`
}

export function itemColor(kind: ItemKind, projectColor: string, custom?: string) {
  if (custom) return custom
  if (kind === "bolsa") return tint(projectColor, 0.35)
  return KIND_COLOR[kind] || projectColor
}

export type StatusKey = "concluido" | "encerrado" | "execucao" | "previsto" | "planejado" | "cenario" | "nao_confirmado"

export interface StatusInfo {
  key: StatusKey
  label: string
  /** Pending documentation marker. */
  pending: boolean
}

/** Situation of an activity at the reference date. Shown by the bar's form, never by colour alone. */
export function statusOf(it: { certainty: Certainty; range: { start: number; end: number } }, ref: number): StatusInfo {
  const c = it.certainty
  const pending = c === "a_validar"
  if (c === "hipotese") return { key: "cenario", label: "Cenário / hipótese", pending: false }
  if (c === "nao_confirmado" || c === "nao_informado") return { key: "nao_confirmado", label: "Não confirmado", pending: true }
  if (c === "planejado") return { key: "planejado", label: "Planejado", pending: false }
  if (it.range.end <= ref) {
    return c === "comprovado" || c === "executado"
      ? { key: "concluido", label: "Concluído", pending: false }
      : { key: "encerrado", label: "Período encerrado · a validar", pending }
  }
  if (it.range.start <= ref) return { key: "execucao", label: "Em execução", pending }
  return { key: "previsto", label: "Previsto", pending }
}

export interface BarStyle {
  fill: string
  fillOpacity: number
  stroke: string
  strokeWidth: number
  dash?: string
  text: string
}

export function barStyleFor(status: StatusKey, color: string): BarStyle {
  switch (status) {
    case "concluido":
    case "execucao":
      return { fill: color, fillOpacity: 1, stroke: color, strokeWidth: 0, text: "#FFFFFF" }
    case "encerrado":
      return { fill: color, fillOpacity: 0.78, stroke: color, strokeWidth: 0, text: "#FFFFFF" }
    case "previsto":
      return { fill: color, fillOpacity: 0.85, stroke: color, strokeWidth: 0, text: "#FFFFFF" }
    case "planejado":
      return { fill: color, fillOpacity: 0.16, stroke: color, strokeWidth: 1.5, text: C.text }
    case "cenario":
      return { fill: "#FFFFFF", fillOpacity: 1, stroke: C.scenario, strokeWidth: 1.6, dash: "6 4", text: C.text }
    case "nao_confirmado":
      return { fill: "#E4E9F0", fillOpacity: 1, stroke: "#B8C3D1", strokeWidth: 1, dash: "2 3", text: C.text2 }
  }
}

/** Legacy helper still used by the presentation. */
export function barStyle(c: Certainty) {
  const solid = c === "comprovado" || c === "executado" || c === "formalizado" || c === "a_validar"
  return {
    fillOpacity: solid ? 1 : c === "planejado" ? 0.16 : c === "hipotese" ? 0 : 0.3,
    stroke: "currentColor",
    strokeOpacity: solid ? 0 : 1,
    dash: c === "hipotese" ? "6 4" : c === "nao_confirmado" || c === "nao_informado" ? "2 3" : undefined,
    pending: c === "a_validar" || c === "nao_confirmado",
    label: c,
  }
}

/** Approximate text wrap for SVG (Inter ≈ 0.55em average advance). */
export function wrapText(text: string, maxPx: number, fontPx = 12): string[] {
  const maxChars = Math.max(6, Math.floor(maxPx / (fontPx * 0.55)))
  const out: string[] = []
  for (const para of text.split("\n")) {
    let line = ""
    for (const w of para.split(/\s+/)) {
      if (!w) continue
      if ((line + " " + w).trim().length > maxChars) {
        if (line) out.push(line)
        line = w
      } else line = (line + " " + w).trim()
    }
    out.push(line)
  }
  return out
}

export const textWidth = (s: string, fontPx = 12) => s.length * fontPx * 0.56

export const truncate = (s: string, px: number, fontPx = 12) => {
  const n = Math.floor(px / (fontPx * 0.56))
  if (n <= 1) return ""
  return s.length > n ? s.slice(0, Math.max(1, n - 1)) + "…" : s
}

export const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
