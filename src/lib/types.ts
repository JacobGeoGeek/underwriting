export type PropertyType = "detached" | "semi" | "townhouse" | "condo" | "duplex";
export type YesNoUnknown = "yes" | "no" | "unknown";
export type Heating = "electric" | "gas" | "oil" | "heat_pump" | "unknown";

export type UnderwriteInput = {
  address: string;
  postalPrefix: string; // e.g., "H2X"
  propertyType: PropertyType;
  yearBuilt: number | null;
  roofAgeYears: number | null;
  basement: YesNoUnknown;
  heating: Heating;
  priorClaims: YesNoUnknown;
  inspectionNotes?: string;
};

export type Decision = "AUTO_QUOTE" | "NEEDS_INFO" | "ESCALATE";

export type ScoreAdjustment = { reason: string; points: number };

export type FollowUpQuestion = {
  id: string;
  question: string;
  whyItMatters: string;
  acceptableEvidence: string[];
};

export type UnderwriteResult = {
  // Final outputs
  riskScore: number; // FINAL score (after AI adjustments)
  confidence: number; // 0-1
  decision: Decision;
  premiumRangeCad: [number, number];

  // Explainability
  topRiskDrivers: string[];
  missingInfo: string[];
  followUpQuestions?: FollowUpQuestion[];

  // Governance
  humanRequiredDecision: string;
  aiRationale: string;

  // Audit trail
  baseRiskScore?: number; // score before AI adjustments
  scoreAdjustments?: ScoreAdjustment[];

  // Notes extraction (LLM + fallback)
  extractedIssues?: string[];
};
