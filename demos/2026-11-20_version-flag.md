# 2026-11-20 — Flip a feature flag locally

```js
// Feature flag: one object, toggle behavior without a deploy
const flags = { newCheckout: false };
function checkout() {
  return flags.newCheckout ? checkoutNew() : checkoutLegacy();
}
flags.newCheckout = true; // roll out to everyone, or per-user
```

A boolean in one place lets you turn a feature on/off instantly.
