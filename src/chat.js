const MODEL = "gemma-4-31b";
 
const SYSTEM_PROMPT = `You are RepAIr, a car repair assistant for beginners who own economy cars.
Ask one short question at a time to find the cause, starting with the most common causes.
Use plain language. When you suggest a fix, list the tools needed, the steps, and how hard the job is.
Warn about safety when it matters (jack stands, hot engine, battery, fuel).
If you are unsure or the job is unsafe for a beginner, tell them to see a mechanic.
Write plain text only. Do not use markdown symbols like ** or #. Use short numbered lines for steps.`;
 
export async function askGemini(prompt, env) {
  const response = await fetch
  (
    "https://generativelanguage.googleapis.com/v1beta/interactions", 
    {
      method: "POST",
      
      headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": env.GEMINI_API_KEY,
      },


      body: JSON.stringify({
        model: MODEL,
        input: prompt,
        system_instruction: SYSTEM_PROMPT,
      }),
    }
  ); 

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error?.message || "Gemini request failed");
  }

  // Collect the text from Gemini's response.
  const reply = (data.steps ?? [])
    .filter(step => step.type === "model_output")
    .flatMap(step => step.content ?? [])
    .filter(part => part.type === "text")
    .map(part => part.text)
    .join("\n");

  return reply; 
}