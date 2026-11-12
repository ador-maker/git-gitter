# 2026-11-12 — Group an array by a key

```js
// Group: index an array by a derived key
function groupBy(arr, keyFn) {
  return arr.reduce((acc, item) => {
    const k = keyFn(item);
    (acc[k] ||= []).push(item);
    return acc;
  }, {});
}
const byStatus = groupBy(users, (u) => u.status);
```

A handy reduce pattern for dashboards and reports.
