import { askGemini } from "./chat.js";
import { verifyGoogleToken, createSessionCookie, clearSessionCookie, getUser } from "./auth.js";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return Response.json({
        message: "Your Worker is running."
      });
    }

    // The Google button gives the page a token. The page sends it here, we check it,
    // then set our own session cookie.
    if (url.pathname === "/api/auth/google") {
      if (request.method !== "POST") {
        return Response.json(
          { error: "Please send a POST request." },
          { status: 405 }
        );
      }

      const { credential } = await request.json().catch(() => ({}));

      if (typeof credential !== "string") {
        return Response.json(
          { error: "Missing Google credential." },
          { status: 400 }
        );
      }

      try {
        const user = await verifyGoogleToken(credential, env);
        const cookie = await createSessionCookie(user, env);

        return Response.json({ user }, { headers: { "Set-Cookie": cookie } });

      } catch (error) {
        console.error(error.message);

        return Response.json(
          { error: "Google sign-in couldn't be verified." },
          { status: 401 }
        );
      }
    }

    if (url.pathname === "/api/me") {
      const user = await getUser(request, env);

      if (!user) {
        return Response.json(
          { error: "Not signed in." },
          { status: 401 }
        );
      }

      return Response.json({ user });
    }

    if (url.pathname === "/api/logout") {
      if (request.method !== "POST") {
        return Response.json(
          { error: "Please send a POST request." },
          { status: 405 }
        );
      }

      return Response.json(
        { message: "Signed out." },
        { headers: { "Set-Cookie": clearSessionCookie() } }
      );
    }

    if (url.pathname === "/api/chat") {
      if (request.method !== "POST") {
        return Response.json(
          { error: "Please send a POST request." },
          { status: 405 }
        );
      }

      const user = await getUser(request, env);

      if (!user) {
        return Response.json(
          { error: "Please sign in first." },
          { status: 401 }
        );
      }

      // The page sends the whole conversation: [{ role: "user" | "model", text }, ...]
      const { messages } = await request.json().catch(() => ({}));

      const valid = Array.isArray(messages) &&
        messages.length > 0 &&
        messages.every(m => (m.role === "user" || m.role === "model") && typeof m.text === "string") &&
        messages.at(-1).role === "user" &&
        messages.at(-1).text.trim();

      if (!valid) {
        return Response.json(
          { error: "Please type a message." },
          { status: 400 }
        );
      }

      // Only send the last 20 messages, each cut to 4000 characters, so a long chat can't run up the bill
      const recent = messages.slice(-20).map(m => ({ role: m.role, text: m.text.slice(0, 4000) }));

      try {
        const reply = await askGemini(recent, env);

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