import { randomBytes } from 'node:crypto';

/**
 * In-memory OAuth session store. Tokens never touch disk, by design: a
 * process restart simply requires re-authorising. For a multi-instance
 * deployment, replace this module with a Redis-backed implementation
 * exposing the same four methods -- nothing else imports the Map.
 */
const sessions = new Map();
const pendingStates = new Map();

const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12h
const STATE_TTL_MS = 10 * 60 * 1000; // 10m

export const newId = () => randomBytes(32).toString('base64url');

/** Records a CSRF `state` value ahead of redirecting to the consent screen. */
export function rememberState(state, sessionId) {
  pendingStates.set(state, { sessionId, expiresAt: Date.now() + STATE_TTL_MS });
}

/** Single-use: consuming a state removes it, so a replayed callback fails. */
export function consumeState(state) {
  const entry = pendingStates.get(state);
  pendingStates.delete(state);
  if (!entry || entry.expiresAt < Date.now()) return null;
  return entry;
}

export function save(sessionId, tokens) {
  sessions.set(sessionId, { ...tokens, updatedAt: Date.now() });
}

export function get(sessionId) {
  if (!sessionId) return null;
  const entry = sessions.get(sessionId);
  if (!entry) return null;
  if (Date.now() - entry.updatedAt > SESSION_TTL_MS) {
    sessions.delete(sessionId);
    return null;
  }
  return entry;
}

export function clear(sessionId) {
  sessions.delete(sessionId);
}

/** Drops expired sessions and states so the maps cannot grow without bound. */
export function sweep() {
  const now = Date.now();
  for (const [id, entry] of sessions) {
    if (now - entry.updatedAt > SESSION_TTL_MS) sessions.delete(id);
  }
  for (const [state, entry] of pendingStates) {
    if (entry.expiresAt < now) pendingStates.delete(state);
  }
}
