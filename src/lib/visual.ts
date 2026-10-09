import type { Certainty, ItemKind } from "@/data/types"

export const BRAND = {
  navy: "#0A1633",
  ink: "#070F24",
  corporate: "#1F4FD1",
  tech: "#2EA8FF",
  orange: "#FF7A1A",
  white: "#FFFFFF",
  grey: "#93A3C8",
  grid: "#16244A",
  gridStrong: "#22356A",
  ref: "#7FD1FF",
  scenario: "#C4B5FD",
}

const KIND_COLOR: Partial<Record<ItemKind, string>> = {
  vigencia: BRAND.orange,
  planejamento: "#8EA2D6",
  bolsa: "#BFD3FF",
  operacao: "#7C8DB5",
  contrato: "#7C8DB5",
  marco: BRAND.orange,
}

export function itemColor(kind: ItemKind, projectColor: string, custom?: string) {
  return custom || KIND_COLOR[kind] || projectColor
}

export interface BarStyle {
  fillOpacity: number
  stroke: string
  strokeOpacity: number
  dash?: string
  /** Whether a small "pending documentation" marker is drawn. */
  pending: boolean
  label: string
}

/** Status is never conveyed by colour alone: every evidence level also changes the outline. */
export function barStyle(c: Certainty): BarStyle {
  switch (c) {
    case "comprovado":
    case "executado":
    case "formalizado":
      return { fillOpacity: 0.92, stroke: "#ffffff", strokeOpacity: 0.0, pending: false, label: "sólida — documentado" }
    case "planejado":
      return { fillOpacity: 0.22, stroke: "currentColor", strokeOpacity: 0.9, dash: "10 4", pending: false, label: "contorno longo — planejado" }
    case "a_validar":
      return { fillOpacity: 0.72, stroke: "#ffffff", strokeOpacity: 0.0, pending: true, label: "preenchida + ! — a validar" }
    case "nao_confirmado":
    case "nao_informado":
      return { fillOpacity: 0.28, stroke: "currentColor", strokeOpacity: 0.9, dash: "2 3", pending: true, label: "pontilhada — não confirmado" }
    case "hipotese":
      return { fillOpacity: 0.16, stroke: "currentColor", strokeOpacity: 1, dash: "6 4", pending: false, label: "tracejada — hipótese" }
  }
}

/** Approximate text wrap for SVG (Inter Tight ≈ 0.53em average advance). */
export function wrapText(text: string, maxPx: number, fontPx = 12): string[] {
  const maxChars = Math.max(6, Math.floor(maxPx / (fontPx * 0.53)))
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

export const truncate = (s: string, px: number, fontPx = 12) => {
  const n = Math.floor(px / (fontPx * 0.56))
  if (n <= 1) return ""
  return s.length > n ? s.slice(0, Math.max(1, n - 1)) + "…" : s
}

export const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
