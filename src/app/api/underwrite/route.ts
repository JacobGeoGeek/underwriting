import { NextResponse } from "next/server";
import type { Decision, FollowUpQuestion, UnderwriteInput, UnderwriteResult } from "@/lib/types";
import { underwrite } from "@/lib/riskEngine";
import { llmText } from "@/lib/llm";
import { extractionPrompt, rationalePrompt } from "@/lib/prompts";

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

function decisionFromScore(score: number, confidence: number, missingCount: number): Decision {
  if (confidence < 0.6) return score > 70 ? "ESCALATE" : "NEEDS_INFO";
  if (missingCount >= 2 && score >= 30) return "NEEDS_INFO";
  if (score < 30) return "AUTO_QUOTE";
  if (score <= 70) return "NEEDS_INFO";
  return "ESCALATE";
}

function premiumRange(score: number): [number, number] {
  const base = 900;
  const est = base + score * 25;
  return [Math.round(est * 0.88), Math.round(est * 1.12)];
}

function fallbackExtractIssues(notes: string): string[] {
  const t = (notes || "").toLowerCase();
  const issues: string[] = [];

  const hasAny = (...keys: string[]) => keys.some((k) => t.includes(k));

  if (hasAny("flood", "floo", "floodplain", "river", "overflow")) issues.push("Flood/river exposure");
  if (hasAny("water infiltration", "infiltration", "water", "leak", "leakage", "seepage"))
    issues.push("Water infiltration / leak risk");
  if (hasAny("mold", "mould", "humidity", "damp")) issues.push("Mold / moisture risk");
  if (hasAny("roof", "shingle", "attic", "ceiling stain")) issues.push("Roof damage / leak risk");
  if (hasAny("foundation", "crack", "settlement")) issues.push("Foundation risk");
  if (hasAny("knob and tube", "knob", "tube", "old wiring", "aluminum wiring"))
    issues.push("Outdated electrical wiring risk");

  return Array.from(new Set(issues));
}

function buildFollowUpQuestions(missingInfo: string[]): FollowUpQuestion[] {
  const map: Record<string, FollowUpQuestion> = {
    "Year built": {
      id: "year_built",
      question: "What is the year the home was built?",
      whyItMatters:
        "Older construction often correlates with higher loss risk (plumbing/electrical/structural uncertainty).",
      acceptableEvidence: ["Property tax roll", "Purchase documents", "Municipal assessment record"],
    },
    "Roof age": {
      id: "roof_age",
      question: "When was the roof last replaced (or what is the current roof age)?",
      whyItMatters: "Roof age strongly affects water damage risk and claim frequency.",
      acceptableEvidence: ["Contractor invoice", "Permit record", "Inspection report"],
    },
    "Heating type": {
      id: "heating_type",
      question: "What is the primary heating type (electric/gas/oil/heat pump)?",
      whyItMatters: "Different systems have different fire and maintenance risk profiles.",
      acceptableEvidence: ["Photos of equipment", "HVAC invoice", "Inspection report"],
    },
    "Claims history confirmation": {
      id: "claims_history",
      question: "Have there been any prior home insurance claims in the last 5 years?",
      whyItMatters: "Prior claims are predictive of future losses and may require underwriting review.",
      acceptableEvidence: ["Claims letter", "Insurer loss history report", "Applicant attestation (with verification)"],
    },
    "Basement confirmation": {
      id: "basement",
      question: "Does the home have a basement and is it finished?",
      whyItMatters: "Basements increase exposure to water infiltration and flood-related losses.",
      acceptableEvidence: ["Listing photos", "Inspection report", "Applicant confirmation"],
    },
    "Flood history details (when/extent)": {
      id: "flood_history",
      question: "Describe any flooding/water ingress events: when, extent of damage, and what was repaired.",
      whyItMatters: "Recurring water issues are a major driver of losses and may require exclusions or mitigation.",
      acceptableEvidence: ["Remediation invoice", "Photos", "Claim record", "Inspection report"],
    },
    "Mitigation present (sump pump / backflow valve / grading)": {
      id: "mitigation",
      question: "What water mitigation exists (sump pump, backflow valve, grading, French drain)?",
      whyItMatters: "Mitigation can materially reduce water loss frequency/severity.",
      acceptableEvidence: ["Photos", "Plumber invoice", "Inspection report"],
    },
    "Any remediation documentation": {
      id: "remediation_docs",
      question: "Provide any remediation documentation for past water/mold issues.",
      whyItMatters: "Confirms whether issues were addressed properly and reduces uncertainty.",
      acceptableEvidence: ["Remediation certificate", "Contractor invoice", "Mold clearance report"],
    },
    "Electrical system details (panel type, wiring updates)": {
      id: "electrical_details",
      question: "What is the electrical panel type and has wiring been updated?",
      whyItMatters: "Outdated wiring increases fire risk and may require underwriting restrictions.",
      acceptableEvidence: ["Electrician invoice", "Permit record", "Inspection report", "Panel photo"],
    },
  };

  // Keep order, de-dupe
  const seen = new Set<string>();
  const out: FollowUpQuestion[] = [];

  for (const item of missingInfo) {
    const q = map[item];
    if (q && !seen.has(q.id)) {
      seen.add(q.id);
      out.push(q);
    }
  }

  // If we have missingInfo that isn’t mapped, still turn it into something usable
  for (const item of missingInfo) {
    const key = `other_${item}`;
    if (!map[item] && !seen.has(key)) {
      seen.add(key);
      out.push({
        id: key,
        question: `Please provide: ${item}`,
        whyItMatters: "This information is needed to reduce underwriting uncertainty.",
        acceptableEvidence: ["Applicant confirmation", "Inspection report", "Relevant invoice/documentation"],
      });
    }
  }

  return out;
}

export async function POST(req: Request) {
  const body = (await req.json()) as Partial<UnderwriteInput>;

  const input: UnderwriteInput = {
    address: body.address ?? "",
    postalPrefix: (body.postalPrefix ?? "").toUpperCase(),
    propertyType: (body.propertyType as any) ?? "detached",
    yearBuilt: body.yearBuilt ?? null,
    roofAgeYears: body.roofAgeYears ?? null,
    basement: (body.basement as any) ?? "unknown",
    heating: (body.heating as any) ?? "unknown",
    priorClaims: (body.priorClaims as any) ?? "unknown",
    inspectionNotes: body.inspectionNotes ?? "",
  };

  // 1) Deterministic base underwriting (source of truth)
  const base = underwrite(input);
  const baseRiskScore = base.riskScore;

  // 2) LLM extraction (only if notes exist)
  let extractedIssues: string[] = [];
  let llmMissing: string[] = [];

  if (input.inspectionNotes?.trim()) {
    try {
      const raw = await llmText(extractionPrompt(input));
      const json = JSON.parse(raw);
      extractedIssues = Array.isArray(json.detectedIssues) ? json.detectedIssues : [];
      llmMissing = Array.isArray(json.missingInfo) ? json.missingInfo : [];
    } catch {
      extractedIssues = fallbackExtractIssues(input.inspectionNotes);
    }

    if (!extractedIssues || extractedIssues.length === 0) {
      extractedIssues = fallbackExtractIssues(input.inspectionNotes);
    }
  }

  // 3) Merge missing info from rules + LLM
  const mergedMissingInfo = Array.from(new Set([...(base.missingInfo ?? []), ...llmMissing]));

  // 4) Apply score adjustments based on extracted issues (AI affects outcome)
  const adjustments: { reason: string; points: number }[] = [];

  const issuesText = extractedIssues.join(" ").toLowerCase();
  const notesText = (input.inspectionNotes ?? "").toLowerCase();

  const floodHit =
    issuesText.includes("flood") ||
    issuesText.includes("river") ||
    issuesText.includes("floodplain") ||
    notesText.includes("flood") ||
    notesText.includes("floo") ||
    notesText.includes("river") ||
    notesText.includes("floodplain");

  if (floodHit) {
    adjustments.push({ reason: "Flood/river exposure extracted from notes", points: 25 });
    mergedMissingInfo.push(
      "Flood history details (when/extent)",
      "Mitigation present (sump pump / backflow valve / grading)",
      "Any remediation documentation",
    );
  }

  const knobTubeHit =
    issuesText.includes("knob") ||
    issuesText.includes("tube") ||
    issuesText.includes("old electrical") ||
    notesText.includes("knob") ||
    notesText.includes("tube");

  if (knobTubeHit) {
    adjustments.push({ reason: "Potential outdated electrical wiring mentioned", points: 15 });
    mergedMissingInfo.push("Electrical system details (panel type, wiring updates)");
  }

  const finalMissingInfo = Array.from(new Set(mergedMissingInfo));

  const adjustedScore = clamp(baseRiskScore + adjustments.reduce((sum, a) => sum + a.points, 0), 0, 100);

  const adjustedDecision = decisionFromScore(adjustedScore, base.confidence, finalMissingInfo.length);
  const adjustedPremium = premiumRange(adjustedScore);

  // 5) Build actionable follow-up questions (this is the "expand human capability" bit)
  const followUpQuestions = buildFollowUpQuestions(finalMissingInfo);

  // 6) LLM rationale uses FINAL decision + score
  let rationale = base.aiRationale;
  try {
    rationale = await llmText(
      rationalePrompt({
        input,
        riskScore: adjustedScore,
        confidence: base.confidence,
        decision: adjustedDecision,
        topRiskDrivers: base.topRiskDrivers,
        missingInfo: finalMissingInfo,
        extractedIssues,
      }),
    );
  } catch {
    // fallback remains base.aiRationale
  }

  const response: UnderwriteResult = {
    ...base,
    // Final outputs
    riskScore: adjustedScore,
    decision: adjustedDecision,
    premiumRangeCad: adjustedPremium,

    // Explainability / governance
    missingInfo: finalMissingInfo,
    followUpQuestions,
    aiRationale: rationale,

    // Audit trail
    baseRiskScore,
    scoreAdjustments: adjustments,

    // Notes extraction
    extractedIssues,
  };

  return NextResponse.json(response);
}
