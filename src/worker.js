import { askGemini } from "./chat.js";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return Response.json({
        message: "Your Worker is running."
      });
    }

    if (url.pathname === "/api/chat") {
      if (request.method !== "POST") {
        return Response.json(
          { error: "Please send a POST request." },
          { status: 405 }
        );
      }

      const { prompt } = await request.json();

      if (typeof prompt !== "string" || !prompt.trim()) {
        return Response.json(
          { error: "Please type a message." },
          { status: 400 }
        );
      }

      try {
        const reply = await askGemini(prompt, env);

        return Response.json({ reply });

      } catch (error) {
        console.error(error.message);

        return Response.json(
          { error: "Gemini couldn't reply. Please try again." },
          { status: 502 }
        );
      }
    }

    return env.ASSETS.fetch(request);
  }
};