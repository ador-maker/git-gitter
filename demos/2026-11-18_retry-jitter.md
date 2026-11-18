# 2026-11-18 — Add jitter to backoff

```js
// Jitter: randomize the delay so many clients don't retry in lockstep
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function withRetry(fn, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try { return await fn(); }
    catch (e) {
      if (i === tries - 1) throw e;
      const base = 200 * 2 ** i;
      await sleep(base + Math.random() * base); // full jitter
    }
  }
}
```

Spreads retry traffic out — the "thundering herd" fix.
