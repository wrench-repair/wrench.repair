import { createRemoteJWKSet, jwtVerify, SignJWT } from "jose";

// Google's public keys for checking sign-in tokens. jose caches them between requests.
const GOOGLE_KEYS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/oauth2/v3/certs")
);

const COOKIE_NAME = "session";
const SESSION_DAYS = 7;

function sessionKey(env) {
  if (!env.SESSION_SECRET) {
    throw new Error("SESSION_SECRET is not set");
  }
  return new TextEncoder().encode(env.SESSION_SECRET);
}

// Check that the token from the Google button is real and meant for our app.
export async function verifyGoogleToken(token, env) {
  const { payload } = await jwtVerify(token, GOOGLE_KEYS, {
    issuer: ["accounts.google.com", "https://accounts.google.com"],
    audience: env.GOOGLE_CLIENT_ID,
  });

  return {
    id: payload.sub, // never changes, use this as the user's ID
    name: payload.name,
    email: payload.email,
    picture: payload.picture,
  };
}

// Our own signed cookie that remembers who is signed in.
export async function createSessionCookie(user, env) {
  const token = await new SignJWT({
    name: user.name,
    email: user.email,
    picture: user.picture,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(sessionKey(env));

  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`;
}

export function clearSessionCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

// Returns the signed-in user, or null if there's no valid session cookie.
export async function getUser(request, env) {
  const cookies = request.headers.get("Cookie") ?? "";
  const match = cookies.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));

  if (!match) {
    return null;
  }

  try {
    const { payload } = await jwtVerify(match[1], sessionKey(env), {
      algorithms: ["HS256"],
    });

    return {
      id: payload.sub,
      name: payload.name,
      email: payload.email,
      picture: payload.picture,
    };
  } catch {
    return null;
  }
}
