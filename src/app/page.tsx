"use client";

import { useMemo, useState } from "react";
import type { Heating, UnderwriteInput, UnderwriteResult, YesNoUnknown } from "@/lib/types";

const EXAMPLES: Record<string, UnderwriteInput> = {
  A: {
    address: "123 Example St, Montreal, QC",
    postalPrefix: "H2X",
    propertyType: "detached",
    yearBuilt: 2018,
    roofAgeYears: 5,
    basement: "no",
    heating: "heat_pump",
    priorClaims: "no",
    inspectionNotes: "No issues noted.",
  },
  B: {
    address: "456 Sample Ave, Gatineau, QC",
    postalPrefix: "J8Y",
    propertyType: "duplex",
    yearBuilt: 1995,
    roofAgeYears: null,
    basement: "unknown",
    heating: "gas",
    priorClaims: "unknown",
    inspectionNotes: "",
  },
  C: {
    address: "789 Demo Rd, Toronto, ON",
    postalPrefix: "M5V",
    propertyType: "detached",
    yearBuilt: 1950,
    roofAgeYears: 22,
    basement: "yes",
    heating: "oil",
    priorClaims: "yes",
    inspectionNotes:
      "The inspector observed possible knob-and-tube wiring in parts of the home. Old electrical panel appears outdated. The basement shows signs of water infiltration and a mould odour. The roof has active leakage near the attic.",
  },
};

export default function Page() {
  const [input, setInput] = useState<UnderwriteInput>(EXAMPLES.A);
  const [result, setResult] = useState<UnderwriteResult | null>(null);
  const [loading, setLoading] = useState(false);

  const badge = useMemo(() => {
    if (!result) return null;
    return result.decision === "AUTO_QUOTE"
      ? "✅ AUTO_QUOTE"
      : result.decision === "NEEDS_INFO"
        ? "🟡 NEEDS_INFO"
        : "🔴 ESCALATE";
  }, [result]);

  async function run() {
    setLoading(true);
    setResult(null);
    const res = await fetch("/api/underwrite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    setResult((await res.json()) as UnderwriteResult);
    setLoading(false);
  }

  function loadExample(key: keyof typeof EXAMPLES) {
    setInput(EXAMPLES[key]);
    setResult(null);
  }

  const baseScore = result?.baseRiskScore ?? null;
  const adjustmentsTotal = result?.scoreAdjustments?.reduce((sum, a) => sum + a.points, 0) ?? 0;

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: 24, fontFamily: "system-ui" }}>
      <h1 style={{ fontSize: 28, fontWeight: 800 }}>Underwriting (Prototype)</h1>
      <p style={{ marginTop: 6, opacity: 0.8 }}>
        Decision: deterministic rules + thresholds • Notes extraction + rationale: OpenAI LLM
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 18 }}>
        {/* Form */}
        <section style={{ padding: 16, border: "1px solid #ddd", borderRadius: 12 }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <button onClick={() => loadExample("A")} style={btnStyle}>
              Load A
            </button>
            <button onClick={() => loadExample("B")} style={btnStyle}>
              Load B
            </button>
            <button onClick={() => loadExample("C")} style={btnStyle}>
              Load C
            </button>
          </div>

          <label style={labelStyle}>Address</label>
          <input
            style={inputStyle}
            value={input.address}
            onChange={(e) => setInput({ ...input, address: e.target.value })}
          />

          <label style={labelStyle}>Postal prefix (e.g., H2X)</label>
          <input
            style={inputStyle}
            value={input.postalPrefix}
            onChange={(e) => setInput({ ...input, postalPrefix: e.target.value.toUpperCase() })}
          />

          <label style={labelStyle}>Year built</label>
          <input
            style={inputStyle}
            type="number"
            value={input.yearBuilt ?? ""}
            onChange={(e) => setInput({ ...input, yearBuilt: e.target.value ? Number(e.target.value) : null })}
          />

          <label style={labelStyle}>Roof age (years)</label>
          <input
            style={inputStyle}
            type="number"
            value={input.roofAgeYears ?? ""}
            onChange={(e) => setInput({ ...input, roofAgeYears: e.target.value ? Number(e.target.value) : null })}
          />

          <label style={labelStyle}>Basement</label>
          <select
            style={inputStyle}
            value={input.basement}
            onChange={(e) => setInput({ ...input, basement: e.target.value as YesNoUnknown })}
          >
            <option value="yes">yes</option>
            <option value="no">no</option>
            <option value="unknown">unknown</option>
          </select>

          <label style={labelStyle}>Heating</label>
          <select
            style={inputStyle}
            value={input.heating}
            onChange={(e) => setInput({ ...input, heating: e.target.value as Heating })}
          >
            <option value="heat_pump">heat_pump</option>
            <option value="electric">electric</option>
            <option value="gas">gas</option>
            <option value="oil">oil</option>
            <option value="unknown">unknown</option>
          </select>

          <label style={labelStyle}>Prior claims</label>
          <select
            style={inputStyle}
            value={input.priorClaims}
            onChange={(e) => setInput({ ...input, priorClaims: e.target.value as YesNoUnknown })}
          >
            <option value="no">no</option>
            <option value="yes">yes</option>
            <option value="unknown">unknown</option>
          </select>

          <label style={labelStyle}>Inspection notes (paste text)</label>
          <textarea
            style={{ ...inputStyle, minHeight: 110 }}
            value={input.inspectionNotes ?? ""}
            onChange={(e) => setInput({ ...input, inspectionNotes: e.target.value })}
          />

          <button
            onClick={run}
            disabled={loading}
            style={{
              ...btnStyle,
              width: "100%",
              marginTop: 10,
              opacity: loading ? 0.6 : 1,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Running..." : "Run underwriting"}
          </button>
        </section>

        {/* Results */}
        <section style={{ padding: 16, border: "1px solid #ddd", borderRadius: 12 }}>
          <h2 style={{ fontSize: 18, fontWeight: 800 }}>Result</h2>

          {loading ? (
            <p style={{ marginTop: 10, opacity: 0.75 }}>Running underwriting engine…</p>
          ) : !result ? (
            <p style={{ marginTop: 10, opacity: 0.75 }}>
              Load an example (or edit fields) and click <b>Run underwriting</b>.
            </p>
          ) : (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 18, fontWeight: 800 }}>{badge}</div>

              <div style={{ display: "flex", gap: 14, marginTop: 10, flexWrap: "wrap" }}>
                <Stat label="Final risk score" value={`${result.riskScore}/100`} />
                <Stat label="Confidence" value={result.confidence.toFixed(2)} />
                <Stat label="Premium range" value={`$${result.premiumRangeCad[0]}–$${result.premiumRangeCad[1]} CAD`} />
              </div>

              {/* Audit Trail */}
              <h3 style={subheadStyle}>Audit trail</h3>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <SmallStat label="Base score" value={baseScore === null ? "—" : `${baseScore}/100`} />
                <SmallStat label="AI adjustments" value={`${adjustmentsTotal >= 0 ? "+" : ""}${adjustmentsTotal}`} />
                <SmallStat label="Final score" value={`${result.riskScore}/100`} />
              </div>

              {result.scoreAdjustments && result.scoreAdjustments.length > 0 && (
                <ul style={{ marginTop: 10 }}>
                  {result.scoreAdjustments.map((a, i) => (
                    <li key={i}>
                      <b>+{a.points}</b> — {a.reason}
                    </li>
                  ))}
                </ul>
              )}

              <h3 style={subheadStyle}>Top risk drivers</h3>
              <ul>
                {result.topRiskDrivers.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>

              <h3 style={subheadStyle}>Missing info</h3>
              {result.missingInfo.length === 0 ? (
                <p>None</p>
              ) : (
                <ul>
                  {result.missingInfo.map((m, i) => (
                    <li key={i}>{m}</li>
                  ))}
                </ul>
              )}

              {/* Actionable follow-ups */}
              {result.followUpQuestions && result.followUpQuestions.length > 0 && (
                <>
                  <h3 style={subheadStyle}>What to ask next</h3>
                  <div style={{ display: "grid", gap: 10 }}>
                    {result.followUpQuestions.map((q) => (
                      <div key={q.id} style={{ border: "1px solid #eee", borderRadius: 10, padding: 10 }}>
                        <div style={{ fontWeight: 800 }}>{q.question}</div>
                        <div style={{ marginTop: 6, opacity: 0.85 }}>{q.whyItMatters}</div>
                        <div style={{ marginTop: 8, fontSize: 13, opacity: 0.85 }}>
                          <b>Acceptable evidence:</b> {q.acceptableEvidence.join(", ")}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {result.extractedIssues && (
                <>
                  <h3 style={subheadStyle}>Extracted from notes</h3>
                  {result.extractedIssues.length === 0 ? (
                    <p>None</p>
                  ) : (
                    <ul>
                      {result.extractedIssues.map((x, i) => (
                        <li key={i}>{x}</li>
                      ))}
                    </ul>
                  )}
                </>
              )}

              <h3 style={subheadStyle}>AI rationale</h3>
              <pre style={{ whiteSpace: "pre-wrap", lineHeight: 1.4, margin: 0 }}>{result.aiRationale}</pre>

              <h3 style={subheadStyle}>Human must decide</h3>
              <p style={{ lineHeight: 1.4, marginBottom: 0 }}>{result.humanRequiredDecision}</p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ padding: 10, border: "1px solid #eee", borderRadius: 10, minWidth: 190 }}>
      <div style={{ fontSize: 12, opacity: 0.7 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 800 }}>{value}</div>
    </div>
  );
}

function SmallStat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ padding: 10, border: "1px solid #f0f0f0", borderRadius: 10, minWidth: 160 }}>
      <div style={{ fontSize: 12, opacity: 0.7 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 800 }}>{value}</div>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 10,
  border: "1px solid #ddd",
  background: "#fff",
  color: "black",
  cursor: "pointer",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  marginTop: 10,
  fontSize: 12,
  opacity: 0.75,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  marginTop: 6,
  padding: "8px 10px",
  borderRadius: 10,
  border: "1px solid #ddd",
};

const subheadStyle: React.CSSProperties = {
  marginTop: 14,
  fontSize: 14,
  fontWeight: 800,
};
