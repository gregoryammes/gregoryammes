import { describe, expect, it } from "vitest"
import {
  calendarMonthsTouched, fromDay, fullCalendarMonths, intersect, isValidISO, lengthDays, partAfter, partBefore,
  partWithin, rangeOf, snapBoundary, toDay,
} from "@/lib/dates"
import { applyScenario, computeOverruns, summarizeScenario } from "@/lib/analysis"
import { createSeed } from "@/data/seed"
import { writePatch } from "@/store/store"

describe("calendar arithmetic", () => {
  it("round-trips ISO dates through day numbers, independent of time zone", () => {
    for (const d of ["2024-02-29", "2027-06-30", "2027-12-31", "2028-01-01", "1999-12-31"]) expect(fromDay(toDay(d))).toBe(d)
  })
  it("validates leap years", () => {
    expect(isValidISO("2028-02-29")).toBe(true)
    expect(isValidISO("2027-02-29")).toBe(false)
    expect(isValidISO("2100-02-29")).toBe(false)
  })
  it("stores inclusive ends as half-open ranges", () => {
    const r = rangeOf("2026-02-01", "2027-12-31")
    expect(lengthDays(r)).toBe(699)
    expect(fromDay(r.end)).toBe("2028-01-01")
  })
  it("splits a course around the vigência", () => {
    const course = rangeOf("2026-02-01", "2027-12-31")
    const vig = rangeOf("2025-05-31", "2027-06-30")
    expect(partBefore(course, vig)).toBeNull()
    expect(lengthDays(partWithin(course, vig)!)).toBe(515)
    const after = partAfter(course, vig)!
    expect(fromDay(after.start)).toBe("2027-07-01")
    expect(fromDay(after.end - 1)).toBe("2027-12-31")
    expect(calendarMonthsTouched(after)).toBe(6)
    expect(fullCalendarMonths(after)).toBe(6)
    expect(lengthDays(after)).toBe(184)
  })
  it("counts calendar months, not pro-rata", () => {
    expect(calendarMonthsTouched(rangeOf("2027-12-31", "2027-12-31"))).toBe(1)
    expect(fullCalendarMonths(rangeOf("2027-12-31", "2027-12-31"))).toBe(0)
    expect(calendarMonthsTouched(rangeOf("2027-06-15", "2027-07-14"))).toBe(2)
  })
  it("intersects and handles disjoint ranges", () => {
    expect(intersect(rangeOf("2025-01-01", "2025-12-31"), rangeOf("2026-01-01", "2026-12-31"))).toBeNull()
  })
  it("snaps to month and quarter boundaries", () => {
    expect(fromDay(snapBoundary(toDay("2026-02-10"), "month"))).toBe("2026-02-01")
    expect(fromDay(snapBoundary(toDay("2026-02-20"), "month"))).toBe("2026-03-01")
    expect(fromDay(snapBoundary(toDay("2026-05-01"), "quarter"))).toBe("2026-04-01")
    expect(fromDay(snapBoundary(toDay("2026-01-07"), "week"))).toBe("2026-01-05")
  })
})

describe("continuity and scenarios", () => {
  it("finds the six post-vigência months of Técnico 1 in the baseline", () => {
    const doc = createSeed()
    const o = computeOverruns(applyScenario(doc, "baseline")).find((x) => x.item.id === "t1")!
    expect(o.months).toBe(6)
    expect(fromDay(o.after.start)).toBe("2027-07-01")
  })
  it("ignores records whose dates are undetermined", () => {
    const doc = createSeed()
    const ids = computeOverruns(applyScenario(doc, "baseline")).map((o) => o.item.id)
    expect(ids).not.toContain("p1-tecnico")
  })
  it("a simulated extension removes the overrun without touching the baseline", () => {
    let doc = createSeed()
    doc = writePatch(doc, "working", "p2-vigencia", { end: "2027-12-31" })
    expect(doc.items.find((i) => i.id === "p2-vigencia")!.end).toBe("2027-06-30")
    const work = applyScenario(doc, "working")
    const vig = work.find((i) => i.id === "p2-vigencia")!
    expect(vig.certainty).toBe("hipotese")
    expect(vig.changed).toBe(true)
    expect(computeOverruns(work).find((o) => o.item.id === "t1")).toBeUndefined()
    expect(computeOverruns(applyScenario(doc, "baseline")).find((o) => o.item.id === "t1")!.months).toBe(6)
  })
  it("moving a course end updates the months after the vigência", () => {
    const doc = writePatch(createSeed(), "baseline", "t1", { end: "2028-03-31" })
    expect(computeOverruns(applyScenario(doc, "baseline")).find((o) => o.item.id === "t1")!.months).toBe(9)
  })
  it("drops overrides that return to the baseline value", () => {
    let doc = writePatch(createSeed(), "working", "t1", { end: "2028-01-31" })
    doc = writePatch(doc, "working", "t1", { end: "2027-12-31" })
    expect(doc.scenarios.find((s) => s.id === "working")!.overrides.t1).toBeUndefined()
  })
  it("summarises the alternative scenario", () => {
    const s = summarizeScenario(createSeed(), "alt-prorrogacao")
    expect(s.t1After).toBeUndefined()
    expect(s.gapToP3).toBe(0)
  })
})

describe("V4 layout and journey", () => {
  it("migrates a v1 document into groups without touching dates", async () => {
    const { normalizeDoc } = await import("@/data/migrate")
    const legacy = createSeed()
    legacy.settings.layout = undefined
    legacy.items = legacy.items.map((i) => (i.id === "t2" ? { ...i, layer: "cenarios" as const, lane: 0 } : i))
    const before = legacy.items.map((i) => [i.id, i.start, i.end, i.certainty])
    const d = normalizeDoc(legacy)
    expect(d.items.find((i) => i.id === "t2")!.layer).toBe("formacao")
    expect(d.items.map((i) => [i.id, i.start, i.end, i.certainty])).toEqual(before)
  })
  it("places Técnico 1 in the 2024 cohort, with its 2027 stage partly after the vigência", async () => {
    const { buildJourney } = await import("@/studio/JourneyMatrix")
    const j = buildJourney(applyScenario(createSeed(), "baseline"), 2022, 2026)
    const y1 = j.cells.find((c) => c.cohort === 2024 && c.stage === 2)!
    const y2 = j.cells.find((c) => c.cohort === 2024 && c.stage === 3)!
    expect(y1.item?.id).toBe("t1")
    expect(y2.item?.id).toBe("t1")
    expect(y2.afterFrom).toBeCloseTo(181 / 365, 2)
    expect(j.cells.find((c) => c.cohort === 2025 && c.stage === 2)!.state).toBe("cenario")
  })
})
