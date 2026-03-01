import { AREA_RISK, DEFAULT_AREA_RISK } from "./riskData";
import type { UnderwriteInput, UnderwriteResult, Decision } from "./types";

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

function missingInfo(input: UnderwriteInput): string[] {
  const missing: string[] = [];
  if (!input.address?.trim()) missing.push("Address");
  if (!input.postalPrefix?.trim()) missing.push("Postal prefix (e.g., H2X)");
  if (input.yearBuilt === null) missing.push("Year built");
  if (input.roofAgeYears === null) missing.push("Roof age");
  if (input.priorClaims === "unknown") missing.push("Claims history confirmation");
  if (input.basement === "unknown") missing.push("Basement confirmation");
  if (input.heating === "unknown") missing.push("Heating type");
  return missing;
}

function computeConfidence(input: UnderwriteInput): number {
  let c = 1.0;
  const criticalUnknowns =
    (input.yearBuilt === null ? 1 : 0) +
    (input.roofAgeYears === null ? 1 : 0) +
    (input.priorClaims === "unknown" ? 1 : 0);
  c -= 0.15 * criticalUnknowns;

  if (input.yearBuilt !== null && input.yearBuilt < 1980 && !input.inspectionNotes?.trim()) {
    c -= 0.1;
  }
  return clamp(c, 0, 1);
}

function decisionFrom(score: number, conf: number, missing: string[]): Decision {
  if (conf < 0.6) return score > 70 ? "ESCALATE" : "NEEDS_INFO";
  if (missing.length >= 2 && score >= 30) return "NEEDS_INFO";
  if (score < 30) return "AUTO_QUOTE";
  if (score <= 70) return "NEEDS_INFO";
  return "ESCALATE";
}

function premiumRange(score: number): [number, number] {
  const base = 900;
  const est = base + score * 25;
  return [Math.round(est * 0.88), Math.round(est * 1.12)];
}

export function underwrite(input: UnderwriteInput): UnderwriteResult {
  const drivers: { pts: number; label: string }[] = [];

  // Year built
  if (input.yearBuilt === null) drivers.push({ pts: 8, label: "Year built unknown" });
  else if (input.yearBuilt < 1960) drivers.push({ pts: 20, label: "Very old construction (<1960)" });
  else if (input.yearBuilt < 2000) drivers.push({ pts: 10, label: "Older construction (1960–1999)" });
  else drivers.push({ pts: 4, label: "Modern construction (2000+)" });

  // Roof age
  if (input.roofAgeYears === null) drivers.push({ pts: 12, label: "Roof age unknown" });
  else if (input.roofAgeYears > 20) drivers.push({ pts: 25, label: "Roof age > 20 years" });
  else if (input.roofAgeYears >= 11) drivers.push({ pts: 15, label: "Roof age 11–20 years" });
  else if (input.roofAgeYears >= 6) drivers.push({ pts: 8, label: "Roof age 6–10 years" });
  else drivers.push({ pts: 2, label: "Roof age 0–5 years" });

  // Basement
  if (input.basement === "yes") drivers.push({ pts: 8, label: "Basement present" });
  else if (input.basement === "unknown") drivers.push({ pts: 5, label: "Basement unknown" });

  // Heating
  if (input.heating === "oil") drivers.push({ pts: 12, label: "Oil heating" });
  else if (input.heating === "gas") drivers.push({ pts: 6, label: "Gas heating" });
  else if (input.heating === "unknown") drivers.push({ pts: 7, label: "Heating type unknown" });
  else drivers.push({ pts: 3, label: "Electric/heat pump heating" });

  // Claims
  if (input.priorClaims === "yes") drivers.push({ pts: 20, label: "Prior claims reported" });
  else if (input.priorClaims === "unknown") drivers.push({ pts: 10, label: "Prior claims unknown" });

  // Area risk
  const r = AREA_RISK[input.postalPrefix.toUpperCase()] ?? DEFAULT_AREA_RISK;
  drivers.push({
    pts: r.flood * 2 + r.fire * 2 + r.crime,
    label: `Area risk (flood ${r.flood}/10, fire ${r.fire}/10, crime ${r.crime}/10)`,
  });

  // Tiny heuristic parsing of inspection notes (demo only)
  const notes = (input.inspectionNotes ?? "").toLowerCase();
  if (notes.includes("water") || notes.includes("infiltration") || notes.includes("mold")) {
    drivers.push({ pts: 20, label: "Inspection notes mention water/mold risk" });
  }
  if (notes.includes("foundation") || notes.includes("crack")) {
    drivers.push({ pts: 15, label: "Inspection notes mention foundation issues" });
  }
  if (notes.includes("leak") || notes.includes("roof")) {
    drivers.push({ pts: 15, label: "Inspection notes mention roof/leak risk" });
  }

  let score = drivers.reduce((s, d) => s + d.pts, 0);
  score = clamp(score, 0, 100);

  const missing = missingInfo(input);
  const conf = computeConfidence(input);
  const decision = decisionFrom(score, conf, missing);

  const topRiskDrivers = drivers
    .sort((a, b) => b.pts - a.pts)
    .slice(0, 3)
    .map((d) => d.label);

  const humanRequiredDecision =
    "Final decision to decline coverage or approve high-risk policies must remain human (accountability, fairness, regulatory risk).";

  const aiRationale =
    decision === "AUTO_QUOTE"
      ? "Low-risk profile based on provided details and area signals. Proceeding with an auto-quote."
      : decision === "NEEDS_INFO"
        ? "Insufficient or uncertain information to issue a reliable quote. Requesting verification of missing fields before proceeding."
        : "High-risk indicators detected. Escalating to a human underwriter for final approval (AI must not auto-decline).";

  return {
    riskScore: score,
    confidence: conf,
    decision,
    premiumRangeCad: premiumRange(score),
    topRiskDrivers,
    missingInfo: missing,
    humanRequiredDecision,
    aiRationale,
  };
}
