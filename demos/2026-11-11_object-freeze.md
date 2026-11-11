# 2026-11-11 — Freeze a config so it can’t drift

```js
// Freeze: make a config object immutable at runtime
const config = Object.freeze({ apiUrl: 'https://api.example.com', retries: 3 });
config.retries = 5; // silently fails in sloppy mode, throws in strict mode
```

Prevents accidental mutation of shared config across modules.
