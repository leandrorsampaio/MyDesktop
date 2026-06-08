# Pre-Release Polish Checklist

Items to ship before posting publicly (Show HN, r/selfhosted, GitHub README on
discoverable services). The codebase itself is in good shape — this list is
**release packaging**, not engineering work.

Why this file exists: the project is approximately a **9/10 codebase wrapped
in a 4/10 release package** (as of 2026-06-08). The gap is non-code work.
Closing it is roughly 1-2 weeks of focused part-time effort.

---

## Priority A — these will hurt reception the most if missing

- [ ] **Build dark mode.** Designed in [`docs/design/`](docs/design/), not built.
      Your target audience (Linear/VS Code/Raycast users per [VISION.md](VISION.md))
      defaults to dark mode. Light-only in 2026 reads as "incomplete."
      *Highest impact single item.*

- [ ] **Pick the project name.** [VISION.md](VISION.md) has 9 candidates. Update
      `package.json` (currently `task-tracker`), the README title, the
      `<title>` tag, and any docs that mention it. `task-tracker` as the public
      name kills first impressions.

- [ ] **Add screenshot + ~30-second demo GIF to README.** OSS visitors scroll
      for ~8 seconds. Without visual proof of design quality, they bounce
      regardless of code quality. Use Kap or QuickTime.

## Priority B — modern OSS hygiene

- [ ] **Add GitHub Actions CI.** A 2026 OSS project without automated tests on
      every PR gets dismissed as unprofessional, regardless of how good the
      tests actually are. One workflow file:

      ```yaml
      # .github/workflows/test.yml
      name: tests
      on: [push, pull_request]
      jobs:
        test:
          runs-on: ubuntu-latest
          steps:
            - uses: actions/checkout@v4
            - uses: actions/setup-node@v4
              with: { node-version: '22' }
            - run: npm run test:unit
            # API tests need a running server; spawn it then run
            - run: RATE_LIMIT_DISABLED=1 node server.js & sleep 2 && npm run test:api
      ```

- [ ] **Write `CONTRIBUTING.md` (one page is enough).** Must explicitly state
      the stake-in-the-ground choices: zero npm deps, no framework, no build
      step, vanilla Web Components. Contributors will otherwise waste time
      proposing React/Vue/Tailwind PRs. Reference [AGENTS.md](AGENTS.md) §
      "House style for agent output" — most of it applies to humans too.

- [ ] **Add `.github/ISSUE_TEMPLATE/` and `PULL_REQUEST_TEMPLATE.md`.** Even
      bare-bones ones. Signals professionalism.

- [ ] **Auto-spawn test server OR loudly document the manual step.**
      Contributors will run `npm test` expecting it to work. Either spawn
      the server inside the test script, or make the API test files print a
      *very* clear hint when they get `ECONNREFUSED`. Currently they print
      a hint but it's quiet.

## Priority C — community-fit signals

- [ ] **README comparison table** — what this is vs. Trello, Jira, Linear,
      a sticky note. Differentiation in one screen. Don't make readers infer it.

- [ ] **Dockerfile + docker-compose.yml.** The r/selfhosted crowd is
      Docker-centric. Your "just `node server.js`" philosophy is legitimate,
      but you need to either:
      - ship a Dockerfile anyway (single-stage, ~10 lines), OR
      - put a section in the README explaining *why* there's no Docker.
      
      Silence on this gets read as "incomplete," not "intentional."

- [ ] **Decide and document the mobile stance.** Drag-and-drop doesn't work
      on touch. Pick one:
      - Add touch support via pointer events (1-2 days of work), OR
      - Add a "Desktop browser only — by design" line to the README top,
        with a one-sentence explanation (this is your homepage, not your
        phone's task tool).

- [ ] **Stress-test with N=1000 tasks.** No one knows yet whether the board
      stays smooth past a few hundred tasks. Either confirm it's fine OR
      document a soft cap. Either is fine; silence is bad.

## Priority D — nice signals

- [ ] **Add a `LICENSE` section to README** with the MIT badge. License is in
      place but not surfaced.

- [ ] **Add badges to top of README** (License, Tests passing, Node version,
      Stars). 2026 readers look for them.

- [ ] **One-line install command** in README that copy-pastes (currently
      requires reading several lines).

- [ ] **Add a "How it's structured" section** in README briefly mapping the
      `public/`, `data/`, `tests/` dirs so people can navigate without
      `tree`-ing the repo.

- [ ] **Pick a primary color / favicon** that matches the design. Current
      favicon may not survive the renaming.

---

## Skip — don't bother

These are tempting but low ROI:

- Adding TypeScript. Violates the "no build step" stake-in-the-ground.
- Adding Storybook. Adds a build step and a dep tree.
- Adding e2e tests with Playwright. Massive dep, marginal value for solo-use app.
- Migrating to any framework. The whole point is no framework.
- Adding i18n. You're the only user.
- Browser-extension version. Different product, scope creep.

---

## Estimated timeline

| Block | Tasks | Effort |
|---|---|---|
| Weekend 1 | Dark mode + name + screenshot/GIF | 1-2 days |
| Weekend 2 | CI + CONTRIBUTING + templates + Dockerfile + README polish | 1 day |
| Whenever | Mobile stance decision + N=1000 stress test | 0.5 day |

Total: ~3-4 focused days of part-time work. Most of it is writing, not coding.

---

## Reception predictions if released *after* this checklist is done

| Venue | Likely outcome |
|---|---|
| **Show HN** | Front-page possible on the "zero-deps, no-framework Express replacement" angle. |
| **r/selfhosted** | Warm. Strong audience fit; Dockerfile + dark mode close the major complaints. |
| **r/javascript / r/webdev** | Mixed but with a vocal "finally, vanilla!" minority. |
| **Mastodon / Bluesky tech** | Sleeper hit potential. Framework-bloat backlash resonates. |
| **GitHub stars (first month)** | 500-2000 if the polish lands and the README is good. |
