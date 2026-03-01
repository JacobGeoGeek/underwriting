import type { UnderwriteInput } from "./types";

export function extractionPrompt(input: UnderwriteInput) {
  return `
Extract ONLY what is explicitly stated in the inspection notes. Do not guess.

Return STRICT JSON only (no markdown):
{
  "detectedIssues": string[],
  "missingInfo": string[],
  "evidence": { "issue": string, "snippet": string }[]
}

Rules:
- If notes do not mention an issue, do not include it.
- missingInfo: list underwriting-critical facts not stated (roof age, electrical, plumbing, etc.).
- evidence.snippet max 20 words.

Inspection notes:
${input.inspectionNotes ?? ""}
`.trim();
}

export function rationalePrompt(args: {
  input: UnderwriteInput;
  riskScore: number;
  confidence: number;
  decision: string;
  topRiskDrivers: string[];
  missingInfo: string[];
  extractedIssues: string[];
}) {
  return `
Write a short underwriting rationale.

Constraints:
- Do NOT invent facts.
- If a field is unknown, say it's unknown.
- Do NOT recommend declining coverage. If high risk, say it requires human review.

Output format:
1) 2–3 sentence summary
2) Top drivers (bullets)
3) Missing info (bullets or "None")
4) Next steps (bullets)

Data:
Decision: ${args.decision}
Risk score: ${args.riskScore}/100
Confidence: ${args.confidence}
Top drivers: ${args.topRiskDrivers.join(" | ")}
Extracted issues: ${args.extractedIssues.join(" | ") || "None"}
Missing info: ${args.missingInfo.join(" | ") || "None"}

User input:
${JSON.stringify(args.input)}
`.trim();
}
