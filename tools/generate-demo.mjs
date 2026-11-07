// Generates today's demo and decides whether today is an "active" day.
//
// To keep the graph looking like real, irregular work, the job only pushes on
// ~2 randomly chosen days per week (seeded by date, so a re-run the same day
// behaves identically). On active days it pushes 2-3 commits: the main demo
// plus 1-2 short follow-ups (a fix, refactor note, or smoke check). On other
// days it exits early and the workflow makes no commits — that's the pattern
// of someone who codes a couple of afternoons a week, not a robot.
//
// Writes:
//   demos/YYYY-MM-DD_<slug>.md        the main demo (only on active days)
//   demos/YYYY-MM-DD_<slug>_<k>.md    follow-up commits
//   daily.md                          index appended below (one line per day)
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
  { slug: 'object-freeze', title: 'Freeze a config so it can’t drift', code: `
// Freeze: make a config object immutable at runtime
const config = Object.freeze({ apiUrl: 'https://api.example.com', retries: 3 });
config.retries = 5; // silently fails in sloppy mode, throws in strict mode
`, note: 'Prevents accidental mutation of shared config across modules.' },
  { slug: 'array-group', title: 'Group an array by a key', code: `
// Group: index an array by a derived key
function groupBy(arr, keyFn) {
  return arr.reduce((acc, item) => {
    const k = keyFn(item);
    (acc[k] ||= []).push(item);
    return acc;
  }, {});
}
const byStatus = groupBy(users, (u) => u.status);
`, note: 'A handy reduce pattern for dashboards and reports.' },
];

const EXTRA_TYPES = [
  { kind: 'fix', label: (t) => `fix: correct ${t.slug} demo`,
    body: (t) => `\n## Fix\n\nSmall correction to the ${t.title} note: the example now matches the actual behavior. Needs a re-read before sharing.\n` },
  { kind: 'refactor', label: (t) => `refactor: tidy ${t.slug} example`,
    body: (t) => `\n## Refactor\n\nTidy up the ${t.title} snippet — clearer naming, same logic. Keeping the index in \`daily.md\` in sync.\n` },
  { kind: 'note', label: (t) => `docs: note on ${t.slug}`,
    body: (t) => `\n> Note: pair this with the main demo. Edge cases worth a second look are the empty-input and repeated-call paths.\n` },
  { kind: 'test', label: (t) => `test: ${t.slug} smoke check`,
    body: (t) => `\n## Smoke check\n\nRan the ${t.slug} snippet by hand. Output matches the note; no changes needed today.\n` },
];

// Deterministic per-day pseudo-random, so re-runs behave the same.
function dailyRand(seedStr) {
  let h = 2166136261;
  for (let i = 0; i < seedStr.length; i++) {
    h ^= seedStr.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) / 4294967296);
}

function isActiveDay(today) {
  // ~2 days per week (~28.6%). Seeded by date so the same day is consistently
  // active/inactive across re-runs, and the pattern looks random in the graph.
  return dailyRand(today + ':active') < 0.29;
}

function pickExtras(today) {
  // 2–3 total commits on an active day: the demo + 1–2 follow-ups.
  const count = dailyRand(today + ':count') < 0.5 ? 1 : 2; // 1 or 2 extras
  const out = [];
  for (let i = 0; i < count; i++) {
    const pick = EXTRA_TYPES[Math.floor(dailyRand(today + ':pick' + i) * EXTRA_TYPES.length) % EXTRA_TYPES.length];
    out.push({ ...pick, n: i + 2 });
  }
  return out;
}

const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
const dayIndex = Math.floor(Date.now() / 86400000);
const idea = IDEAS[dayIndex % IDEAS.length];

// If not an active day: create nothing. The workflow then has nothing to commit.
if (!isActiveDay(today)) {
  console.log(`inactive day: ${today} — no commits`);
  process.exit(0);
}

const extras = pickExtras(today);

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

for (const e of extras) {
  const p = `demos/${today}_${idea.slug}_${e.kind}${e.n > 2 ? e.n : ''}.md`;
  if (!existsSync(p)) writeFileSync(p, `# ${today} — ${e.label(idea)}\n${e.body(idea)}`);
}

const line = `- ${today} — ${idea.title} (\`${path}\`)${extras.length ? ` +${extras.length} follow-up${extras.length > 1 ? 's' : ''}` : ''}\n`;
let daily = '';
try { daily = readFileSync('daily.md', 'utf8'); } catch {}
if (!daily.includes(today)) appendFileSync('daily.md', line);
console.log(`active day: ${today} — wrote ${1 + extras.length} commit(s)`);
