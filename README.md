# Daily demo — contribution streak, on autopilot

One small, real code demo pushed every day so the GitHub contribution graph stays alive — even with your PC off. Runs on GitHub Actions, server-side.

## How it works

- `.github/workflows/daily.yml` — triggers at **00:07 UTC daily** (offset off :00 so it doesn't land in the post-midnight Action queue), and on manual "Run workflow" from the Actions tab.
- `tools/generate-demo.mjs` — generates **one real demo per day** (a short code snippet + note), written to `demos/YYYY-MM-DD_<slug>.md` and indexed in `daily.md`. No empty commits, no date-stamp spam.
- The workflow commits as **your identity** via the `users.noreply.github.com` address, so the contribution links to your profile.

## One-time setup

1. Create a new **public** repo, e.g. `daily-demo` (must be public for the graph to count it).
2. Push this folder to it as `main`:
   ```bash
   gh repo create daily-demo --public --source=. --push
   # or:
   git init && git add . && git commit -m "init" && git branch -M main \
     && git remote add origin <your-repo-url> && git push -u origin main
   ```
3. **Settings → Actions → General → Workflow permissions → Read and write permissions** (enable it if your account default denies it).
4. That's it. First run fires on the next 00:07 UTC or via Actions → Daily demo → Run workflow.

## Keep it green

- The cron is the single point of failure. Scheduled runs can be **delayed up to ~30 min late** by GitHub, so it rarely lands exactly at midnight — fine, the contribution still counts for that UTC day.
- A missed UTC day **cannot be repaired** — GitHub credits the push day, not the commit date.
- Actions are auto-disabled after **~60 days** of repo inactivity; the daily push keeps the repo "active," so it keeps running.
- Darkest green needs more than one contribution per day — one demo commit + an issue/PR or a second tiny commit gets you there.

## Change it

- Add your own topics to `IDEAS` in `tools/generate-demo.mjs`
- Change the time in `.github/workflows/daily.yml` (`0 7 * * *` = 07:00 UTC, etc.)
