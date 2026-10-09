import * as React from "react"
import { cn } from "@/lib/utils"

type Variant = "default" | "primary" | "ghost" | "outline" | "accent" | "danger"
type Size = "sm" | "md" | "icon"

const VARIANTS: Record<Variant, string> = {
  default: "bg-muted text-foreground hover:bg-[#1b2c57]",
  primary: "bg-primary text-primary-foreground hover:brightness-110",
  accent: "bg-accent text-[#1a0b00] hover:brightness-110",
  ghost: "bg-transparent text-foreground/85 hover:bg-white/5",
  outline: "border border-border bg-transparent text-foreground hover:bg-white/5",
  danger: "bg-destructive/15 text-[#ff9ea1] hover:bg-destructive/25",
}
const SIZES: Record<Size, string> = {
  sm: "h-7 px-2.5 text-xs gap-1.5",
  md: "h-8 px-3 text-[13px] gap-2",
  icon: "size-8 justify-center",
}

export interface ButtonProps extends React.ComponentProps<"button"> {
  variant?: Variant
  size?: Size
  active?: boolean
}

export function Button({ variant = "default", size = "md", active, className, ...props }: ButtonProps) {
  return (
    <button
      type="button"
      data-active={active ? "true" : undefined}
      className={cn(
        "inline-flex shrink-0 cursor-pointer items-center rounded-md font-medium whitespace-nowrap transition-[background,filter,color] duration-150 outline-none",
        "focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:pointer-events-none disabled:opacity-40",
        "data-[active=true]:bg-primary/20 data-[active=true]:text-primary",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    />
  )
}

export function Divider({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn("mx-1 h-5 w-px bg-border", className)} />
}

export function Chip({ className, ...p }: React.ComponentProps<"span">) {
  return <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium", className)} {...p} />
}
