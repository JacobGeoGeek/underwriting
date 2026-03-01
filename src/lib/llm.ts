import OpenAI from "openai";

export async function llmText(prompt: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY in .env.local");

  const client = new OpenAI({ apiKey });

  const resp = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: "Follow instructions exactly. Be concise. Don't invent facts." },
      { role: "user", content: prompt },
    ],
    temperature: 0.2,
  });

  return resp.choices[0]?.message?.content ?? "";
}
