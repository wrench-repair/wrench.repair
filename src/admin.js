import { getUser } from "./auth.js";
import { listUsers, getUserDetail, setBlocked, listFlagged } from "./db.js";
import { SLOW_MS } from "./webhook.js";

// set ADMIN_EMAILS (comma-separated)
export function isAdmin(user, env) {
  const admins = (env.ADMIN_EMAILS ?? "")
    .split(",")
    .map(e => e.trim().toLowerCase())
    .filter(Boolean);
  return Boolean(user?.email) && admins.includes(user.email.toLowerCase());
}

export async function handleAdmin(request, url, env) {
  const user = await getUser(request, env);

  if (!isAdmin(user, env)) {
    return Response.json({ error: "Admins only." }, { status: 403 });
  }

  if (!env.DB) {
    return Response.json({ error: "The database isn't set up." }, { status: 500 });
  }

  const path = url.pathname.replace("/api/admin", "");

  if (path === "/users" && request.method === "GET") {
    return Response.json({ users: await listUsers(env) });
  }

  if (path === "/flagged" && request.method === "GET") {
    return Response.json({ messages: await listFlagged(SLOW_MS, env), slowMs: SLOW_MS });
  }

  // /users/<id>
  let match = path.match(/^\/users\/([^/]+)$/);
  if (match && request.method === "GET") {
    const detail = await getUserDetail(decodeURIComponent(match[1]), env);
    if (!detail) {
      return Response.json({ error: "No such user." }, { status: 404 });
    }
    return Response.json({ ...detail, slowMs: SLOW_MS });
  }

  // /users/<id>/block
  match = path.match(/^\/users\/([^/]+)\/block$/);
  if (match && request.method === "POST") {
    const { blocked } = await request.json().catch(() => ({}));
    if (typeof blocked !== "boolean") {
      return Response.json({ error: "Send { blocked: true | false }." }, { status: 400 });
    }
    await setBlocked(decodeURIComponent(match[1]), blocked, env);
    return Response.json({ blocked });
  }

  return Response.json({ error: "Not found." }, { status: 404 });
}
