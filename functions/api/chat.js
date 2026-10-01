const MODEL = "gemini-3-flash-preview";
 
const SYSTEM_PROMPT = `You are RepAIr, a car repair assistant for beginners who own economy cars.
Ask one short question at a time to find the cause, starting with the most common causes.
Use plain language. When you suggest a fix, list the tools needed, the steps, and how hard the job is.
Warn about safety when it matters (jack stands, hot engine, battery, fuel).
If you are unsure or the job is unsafe for a beginner, tell them to see a mechanic.
Write plain text only. Do not use markdown symbols like ** or #. Use short numbered lines for steps.`;
 
export async function onRequestPost(context) {
  const { messages } = await context.request.json();
 
  const reply = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": context.env.GEMINI_API_KEY,
      },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: messages.map((m) => ({
          role: m.role === "user" ? "user" : "model",
          parts: [{ text: m.text }],
        })),
      }),
    }
  );
 
  const data = await reply.json();
 
  if (!reply.ok) {
    return Response.json(
      { error: data.error?.message || "Gemini request failed" },
      { status: reply.status }
    );
  }
 
  const text = (data.candidates?.[0]?.content?.parts || [])
    .map((p) => p.text || "")
    .join("");
 
  return Response.json({ reply: text });
}
 