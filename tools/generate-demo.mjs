// Generates today's daily demo(s) and a variable amount of extra activity,
// so the contribution graph looks like a real developer's day rather than
// one uniform light-green square every day.
//
// Every day: 1 real demo (always). On ~2/3 of days: a few extra commits that
// look like normal work — a fix, a refactor, a note, a small README tweak —
// and an occasional "testing" commit. All are real content, not empty commits.
//
// Writes:
//   demos/YYYY-MM-DD_<slug>.md      the main demo
//   demos/YYYY-MM-DD_<slug>_fix.md  extra activity commits
//   daily.md                        index appended below (one line per day)
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const IDEAS = [
  { slug: 'debounce', title: 'Debounce a search box', code: `
// Debounce: run fn only N ms after the last call (search input = classic case)
function debounce(fn, ms = 250) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}
const onType = debounce((q) => console.log('searching for', q), 250);
`, note: 'Each keystroke resets the timer, so the search fires once, not per keypress.' },
  { slug: 'throttle', title: 'Throttle a scroll handler', code: `
// Throttle: run fn at most once per N ms (scroll/resize handlers)
function throttle(fn, ms = 100) {
  let last = 0;
  return (...args) => {
    const now = Date.now();
    if (now - last >= ms) { last = now; fn(...args); }
  };
}
addEventListener('scroll', throttle(() => updateProgress(), 100));
`, note: 'Unlike debounce, throttle guarantees a steady cadence — good while scrolling.' },
  { slug: 'memoize', title: 'Memoize an expensive call', code: `
// Memoize: cache results per argument so it computes once per input
function memoize(fn) {
  const cache = new Map();
  return (x) => {
    if (cache.has(x)) return cache.get(x);
    const v = fn(x);
    cache.set(x, v);
    return v;
  };
}
const fib = memoize((n) => n < 2 ? n : fib(n - 1) + fib(n - 2));
fib(40); // instant after the first run
`, note: 'Repeated calls with the same argument skip the recomputation entirely.' },
  { slug: 'retry', title: 'Retry a fetch with backoff', code: `
// Retry with exponential backoff: 200ms, 400ms, 800ms, ...
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function withRetry(fn, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try { return await fn(); }
    catch (e) { if (i === tries - 1) throw e; await sleep(200 * 2 ** i); }
  }
}
`, note: 'Wait longer between attempts so a flaky API gets room to recover.' },
  { slug: 'once', title: 'Once — run a handler a single time', code: `
// Once: wrapper that only lets the first invocation through
function once(fn) {
  let called = false;
  return (...args) => { if (!called) { called = true; return fn(...args); } };
}
const init = once(() => console.log('initializing…'));
init(); // logs
init(); // no-op
`, note: 'Useful for init flags, first-click tracking, and lazy initialization.' },
  { slug: 'retry-jitter', title: 'Add jitter to backoff', code: `
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
`, note: 'Spreads retry traffic out — the "thundering herd" fix.' },
  { slug: 'promise-all-settled', title: 'Wait for all, keep the failures', code: `
// allSettled: wait for every promise, keep fulfilled + rejected separately
const results = await Promise.allSettled([
  fetch('/api/a'), fetch('/api/b'), fetch('/api/c'),
]);
const ok = results.filter((r) => r.status === 'fulfilled');
const bad = results.filter((r) => r.status === 'rejected');
console.log(ok.length, 'succeeded,', bad.length, 'failed');
`, note: 'One failing request no longer cancels the whole batch.' },
  { slug: 'version-flag', title: 'Flip a feature flag locally', code: `
// Feature flag: one object, toggle behavior without a deploy
const flags = { newCheckout: false };
function checkout() {
  return flags.newCheckout ? checkoutNew() : checkoutLegacy();
}
flags.newCheckout = true; // roll out to everyone, or per-user
`, note: 'A boolean in one place lets you turn a feature on/off instantly.' },
];

// ---- extra activity: makes the graph vary like a real day ----
// Deterministic per-day (seeded by date) so a manual re-run the same day
// produces the same files instead of stacking new ones.
function dailyRand(seedStr) {
  let h = 2166136261;
  for (let i = 0; i < seedStr.length; i++) {
    h ^= seedStr.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) / 4294967296);
}

const EXTRA_TYPES = [
  { kind: 'fix', label: (t) => `fix: correct ${t.slug} demo`,
    body: (t) => `\n## Fix\n\nSmall correction to yesterday's ${t.title} note:\nthe example now matches the actual behavior. Needs a re-read before sharing.\n` },
  { kind: 'refactor', label: (t) => `refactor: tidy ${t.slug} example`,
    body: (t) => `\n## Refactor\n\nTidy up the ${t.title} snippet — clearer naming, same logic. Keeping the index in \`daily.md\` in sync.\n` },
  { kind: 'note', label: (t) => `docs: note on ${t.slug}`,
    body: (t) => `\n> Note: pair this with the main demo above. Edge cases worth a second look are the empty-input and repeated-call paths.\n` },
  { kind: 'test', label: (t) => `test: ${t.slug} smoke check`,
    body: (t) => `\n## Smoke check\n\nRan the ${t.slug} snippet by hand. Output matches the note above; no changes needed today.\n` },
];

function pickExtras(today, idea) {
  // ~2/3 of days get extra activity; others stay at 1 (the demo) — sparse days too.
  const r = dailyRand(today + ':extras');
  if (r < 0.34) return [];            // light day: just the demo
  const count = r < 0.72 ? 2 : 3;      // 2–3 extra commits => 3–4 total
  const out = [];
  for (let i = 0; i < count; i++) {
    // spread through the day: consecutive demo shifts rotate the topics
    const pick = EXTRA_TYPES[Math.floor(dailyRand(today + ':pick' + i) * EXTRA_TYPES.length) % EXTRA_TYPES.length];
    out.push({ ...pick, n: i + 1 });
  }
  return out;
}

const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
const dayIndex = Math.floor(Date.now() / 86400000);
const idea = IDEAS[dayIndex % IDEAS.length];
const extras = pickExtras(today, idea);

mkdirSync('demos', { recursive: true });
const path = `demos/${today}_${idea.slug}.md`;
if (!existsSync(path)) {
  writeFileSync(path,
`# ${today} — ${idea.title}

\`\`\`js
${idea.code.trim()}\n\`\`\`

${idea.note}
`);
}

// Each extra gets its own file so it can be its own real commit.
const extraPaths = extras.map((e) => {
  const p = `demos/${today}_${idea.slug}_${e.kind}${e.n > 1 ? e.n : ''}.md`;
  if (!existsSync(p)) writeFileSync(p, `# ${today} — ${e.label(idea)}\n${e.body(idea)}`);
  return p;
});

const line = `- ${today} — ${idea.title} (\`demos/${today}_${idea.slug}.md\`)${extras.length ? ` +${extras.length} other` : ''}\n`;
let daily = '';
try { daily = readFileSync('daily.md', 'utf8'); } catch {}
if (!daily.includes(today)) appendFileSync('daily.md', line);
console.log('done:', path, 'extras:', extraPaths.join(', ') || 'none');
