// Run: node --test lib/auth-fix.test.ts   (Node >= 23, native TS type stripping)
import test from "node:test";
import assert from "node:assert/strict";
import { createSingleFlight } from "./single-flight.ts";
import { isSessionDead, NoRefreshTokenError } from "./auth-session.ts";
import { accessTokenSecondsLeft } from "./jwt.ts";

test("single-flight: concurrent calls collapse into ONE execution", async () => {
  let runs = 0;
  let resolveFn: (v: string) => void = () => {};
  const sf = createSingleFlight<string>(() => {
    runs++;
    return new Promise((r) => {
      resolveFn = r;
    });
  });
  const p1 = sf();
  const p2 = sf();
  const p3 = sf();
  assert.equal(runs, 1, "producer must run once for concurrent callers");
  resolveFn("tok");
  assert.deepEqual(await Promise.all([p1, p2, p3]), ["tok", "tok", "tok"]);
});

test("single-flight: re-runs after the in-flight promise settles", async () => {
  let runs = 0;
  const sf = createSingleFlight(async () => ++runs);
  assert.equal(await sf(), 1);
  assert.equal(await sf(), 2);
});

test("single-flight: a rejection clears the slot so the next call retries", async () => {
  let runs = 0;
  const sf = createSingleFlight(async () => {
    runs++;
    if (runs === 1) throw new Error("boom");
    return "ok";
  });
  await assert.rejects(sf(), /boom/);
  assert.equal(await sf(), "ok");
});

test("isSessionDead: dead ONLY on missing refresh or 401/403", () => {
  assert.equal(isSessionDead(new NoRefreshTokenError()), true);
  assert.equal(isSessionDead({ response: { status: 401 } }), true);
  assert.equal(isSessionDead({ response: { status: 403 } }), true);
  // transient — must NOT wipe the session
  assert.equal(isSessionDead({ response: { status: 500 } }), false);
  assert.equal(isSessionDead(new Error("Network Error")), false);
  assert.equal(isSessionDead(undefined), false);
});

test("accessTokenSecondsLeft", () => {
  assert.equal(accessTokenSecondsLeft(null), 0);
  assert.equal(accessTokenSecondsLeft("garbage"), 0);
  const exp = Math.floor(Date.now() / 1000) + 1000;
  const payload = Buffer.from(
    JSON.stringify({ sub: "x", role: "user", exp })
  ).toString("base64url");
  const left = accessTokenSecondsLeft(`h.${payload}.s`);
  assert.ok(left > 900 && left <= 1000, `expected ~1000, got ${left}`);
});
