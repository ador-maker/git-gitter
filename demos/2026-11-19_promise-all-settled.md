# 2026-11-19 — Wait for all, keep the failures

```js
// allSettled: wait for every promise, keep fulfilled + rejected separately
const results = await Promise.allSettled([
  fetch('/api/a'), fetch('/api/b'), fetch('/api/c'),
]);
const ok = results.filter((r) => r.status === 'fulfilled');
const bad = results.filter((r) => r.status === 'rejected');
console.log(ok.length, 'succeeded,', bad.length, 'failed');
```

One failing request no longer cancels the whole batch.
