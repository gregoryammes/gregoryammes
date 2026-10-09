/**
 * Calendar arithmetic for the studio.
 *
 * Every date in the data model is an ISO calendar date (`YYYY-MM-DD`) with no time and no zone.
 * Computation happens on *day numbers* — whole days since 1970-01-01 computed with `Date.UTC`, so a
 * viewer's time zone or a daylight-saving change can never shift a bar by a day.
 *
 * Intervals are entered and displayed with an INCLUSIVE end ("fev/2026 a dez/2027" means the last
 * day of December is part of it). Internally they are converted to HALF-OPEN ranges
 * `[start, endExclusive)`, which makes lengths, intersections and adjacency exact.
 */

export type ISODate = string

export interface DayRange {
  /** First day, inclusive. */
  start: number
  /** Day after the last day — exclusive. */
  end: number
}

const MS_PER_DAY = 86_400_000
const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/

export function isValidISO(s: string): boolean {
  const m = ISO_RE.exec(s)
  if (!m) return false
  const y = +m[1], mo = +m[2], d = +m[3]
  return mo >= 1 && mo <= 12 && d >= 1 && d <= daysInMonth(y, mo)
}

export function isLeap(y: number) {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0
}

/** `month` is 1-based. */
export function daysInMonth(y: number, month: number) {
  return [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]
}

export function toDay(iso: ISODate): number {
  const m = ISO_RE.exec(iso)
  if (!m) throw new Error(`Data inválida: ${iso}`)
  return Math.round(Date.UTC(+m[1], +m[2] - 1, +m[3]) / MS_PER_DAY)
}

export function fromDay(day: number): ISODate {
  const d = new Date(day * MS_PER_DAY)
  const y = d.getUTCFullYear()
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0")
  const da = String(d.getUTCDate()).padStart(2, "0")
  return `${String(y).padStart(4, "0")}-${mo}-${da}`
}

export function ymd(day: number) {
  const d = new Date(day * MS_PER_DAY)
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), dow: d.getUTCDay() }
}

export function dayOf(y: number, month: number, d = 1) {
  // Date.UTC normalises overflow (month 13 → January of next year), which the helpers below rely on.
  return Math.round(Date.UTC(y, month - 1, d) / MS_PER_DAY)
}

/** Inclusive ISO pair → half-open day range. */
export function rangeOf(startISO: ISODate, endISOInclusive: ISODate): DayRange {
  return { start: toDay(startISO), end: toDay(endISOInclusive) + 1 }
}

/** Half-open range → inclusive ISO pair, for display and storage. */
export function isoOf(r: DayRange): { start: ISODate; end: ISODate } {
  return { start: fromDay(r.start), end: fromDay(r.end - 1) }
}

export const lengthDays = (r: DayRange) => Math.max(0, r.end - r.start)

export function intersect(a: DayRange, b: DayRange): DayRange | null {
  const start = Math.max(a.start, b.start)
  const end = Math.min(a.end, b.end)
  return end > start ? { start, end } : null
}

/** The part of `r` strictly before `ref` starts. */
export function partBefore(r: DayRange, ref: DayRange): DayRange | null {
  return intersect(r, { start: -Infinity, end: ref.start })
}
/** The part of `r` inside `ref`. */
export function partWithin(r: DayRange, ref: DayRange): DayRange | null {
  return intersect(r, ref)
}
/** The part of `r` after `ref` ends. */
export function partAfter(r: DayRange, ref: DayRange): DayRange | null {
  return intersect(r, { start: ref.end, end: Infinity })
}

/**
 * Number of distinct calendar months touched by the range. 01/07/2027–31/12/2027 → 6.
 * This is a calendar count, deliberately not a pro-rata financial measure: 31/12 alone counts as 1.
 */
export function calendarMonthsTouched(r: DayRange | null): number {
  if (!r || r.end <= r.start) return 0
  const a = ymd(r.start)
  const b = ymd(r.end - 1)
  return (b.y - a.y) * 12 + (b.m - a.m) + 1
}

/** Whole calendar months fully covered by the range (a partial month at either end does not count). */
export function fullCalendarMonths(r: DayRange | null): number {
  if (!r || r.end <= r.start) return 0
  let n = 0
  let cur = startOfMonth(r.start)
  if (cur < r.start) cur = addMonths(cur, 1)
  while (addMonths(cur, 1) <= r.end) {
    n++
    cur = addMonths(cur, 1)
  }
  return n
}

export function startOfMonth(day: number) {
  const { y, m } = ymd(day)
  return dayOf(y, m, 1)
}
export function startOfQuarter(day: number) {
  const { y, m } = ymd(day)
  return dayOf(y, Math.floor((m - 1) / 3) * 3 + 1, 1)
}
export function startOfYear(day: number) {
  return dayOf(ymd(day).y, 1, 1)
}
/** ISO weeks start on Monday. */
export function startOfWeek(day: number) {
  const dow = ymd(day).dow
  return day - ((dow + 6) % 7)
}
/** Adds calendar months to the first-of-month (clamps the day of month when needed). */
export function addMonths(day: number, n: number) {
  const { y, m, d } = ymd(day)
  const total = y * 12 + (m - 1) + n
  const ny = Math.floor(total / 12)
  const nm = (total % 12) + 1
  return dayOf(ny, nm, Math.min(d, daysInMonth(ny, nm)))
}

export type SnapUnit = "none" | "day" | "week" | "month" | "quarter"

export function unitStart(day: number, unit: SnapUnit) {
  switch (unit) {
    case "week":
      return startOfWeek(day)
    case "month":
      return startOfMonth(day)
    case "quarter":
      return startOfQuarter(day)
    default:
      return day
  }
}
function unitNext(boundary: number, unit: SnapUnit) {
  switch (unit) {
    case "week":
      return boundary + 7
    case "month":
      return addMonths(boundary, 1)
    case "quarter":
      return addMonths(boundary, 3)
    default:
      return boundary + 1
  }
}

/** Rounds a (fractional) day position to the nearest unit boundary. */
export function snapBoundary(day: number, unit: SnapUnit): number {
  if (unit === "none" || unit === "day") return Math.round(day)
  const lo = unitStart(Math.floor(day), unit)
  const hi = unitNext(lo, unit)
  return day - lo < hi - day ? lo : hi
}

const MONTHS_PT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]
const MONTHS_PT_LONG = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
]

export const monthShort = (m: number) => MONTHS_PT[m - 1]
export const monthLong = (m: number) => MONTHS_PT_LONG[m - 1]

export type Precision = "day" | "month" | "year"

/** `2027-06-30` → `30/06/2027`; at month precision `jun/2027`; at year precision `2027`. */
export function fmtDate(iso: ISODate, precision: Precision = "day") {
  const [y, m, d] = iso.split("-")
  if (precision === "year") return y
  if (precision === "month") return `${MONTHS_PT[+m - 1]}/${y}`
  return `${d}/${m}/${y}`
}

export function fmtRange(r: DayRange, precision: Precision = "day") {
  const { start, end } = isoOf(r)
  return `${fmtDate(start, precision)} – ${fmtDate(end, precision)}`
}

export function fmtMonthsSpan(r: DayRange) {
  const a = ymd(r.start)
  const b = ymd(r.end - 1)
  return `${MONTHS_PT[a.m - 1]}/${a.y} a ${MONTHS_PT[b.m - 1]}/${b.y}`
}

export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export function todayISO(): ISODate {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}
