import { askGemini, isRefusal } from "./chat.js";
import { verifyGoogleToken, createSessionCookie, clearSessionCookie, getUser } from "./auth.js";
import { notifyWebhook, describeError } from "./webhook.js";
import { recordVisit, saveMessage, rateMessage } from "./db.js";
import { handleAdmin, isAdmin } from "./admin.js";

// Database errors shouldn't break sign-in or chat
async function safely(promise, fallback = null) {
  try {
    return await promise;
  } catch (error) {
    console.error("Database error: " + error.message);
    return fallback;
  }
}

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

        await safely(recordVisit(user, request, env));

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

      return Response.json({ user, admin: isAdmin(user, env) });
    }

    if (url.pathname.startsWith("/api/admin/")) {
      return handleAdmin(request, url, env);
    }

    // Thumbs up / down
    if (url.pathname === "/api/chat/feedback") {
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

      const { messageId, rating } = await request.json().catch(() => ({}));

      if (!Number.isInteger(messageId) || ![1, -1, null].includes(rating)) {
        return Response.json(
          { error: "Send { messageId, rating: 1 | -1 | null }." },
          { status: 400 }
        );
      }

      await rateMessage(user.id, messageId, rating, env);
      return Response.json({ rating });
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

      const { blocked } = await safely(recordVisit(user, request, env), { blocked: false });

      if (blocked) {
        return Response.json(
          { error: "Your account can't use the chat right now." },
          { status: 403 }
        );
      }

      const body = await request.json().catch(() => ({}));
      const { messages } = body;

      const conversationId = typeof body.conversationId === "string" && body.conversationId.length <= 64
        ? body.conversationId
        : crypto.randomUUID();

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

      const log = {
        user,
        text: recent.at(-1).text,
        messageNumber: messages.filter(m => m.role === "user").length,
        country: request.cf?.country,
      };
      const started = Date.now();
      const saved = { userId: user.id, conversationId, text: log.text };

      try {
        const { reply, usage } = await askGemini(recent, env);
        const ms = Date.now() - started;

        // Runs in the background
        ctx.waitUntil(notifyWebhook({ ...log, reply, usage, ms }, env));

        // Awaited so the chat page gets the ID for ratings
        const messageId = await safely(
          saveMessage({ ...saved, reply, usage, ms, refused: isRefusal(reply) }, request, env)
        );

        return Response.json({ reply, messageId, conversationId });

      } catch (error) {
        console.error(error.message);
        const ms = Date.now() - started;

        ctx.waitUntil(notifyWebhook({ ...log, error, ms }, env));
        ctx.waitUntil(safely(
          saveMessage({ ...saved, ms, error: describeError(error) + ": " + error.message }, request, env)
        ));

        return Response.json(
          { error: "Gemini couldn't reply. Please try again." },
          { status: 502 }
        );
      }
    }

    return env.ASSETS.fetch(request);
  }
};