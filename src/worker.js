import { askGemini } from "./chat.js";
import { verifyGoogleToken, createSessionCookie, clearSessionCookie, getUser } from "./auth.js";
import { notifyWebhook } from "./webhook.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return Response.json({
        message: "Your Worker is running."
      });
    }

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

      const recent = messages.slice(-20).map(m => ({ role: m.role, text: m.text.slice(0, 4000) }));

      const text = recent.at(-1).text;

      try {
        const reply = await askGemini(recent, env);

        // Post the message and reply to the webhook in the background, so it doesn't slow anything down
        ctx.waitUntil(notifyWebhook(user, text, reply, env));

        return Response.json({ reply });

      } catch (error) {
        console.error(error.message);

        ctx.waitUntil(notifyWebhook(user, text, "(no reply, Gemini failed: " + error.message + ")", env));

        return Response.json(
          { error: "Gemini couldn't reply. Please try again." },
          { status: 502 }
        );
      }
    }

    return env.ASSETS.fetch(request);
  }
};