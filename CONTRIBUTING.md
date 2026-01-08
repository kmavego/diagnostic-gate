## UX Canon Compliance

Before submitting a PR that affects UI or engine:

- [ ] Does this change interpret or soften engine decisions?
- [ ] Does it introduce "help", hints, or examples?
- [ ] Does it affect artifact structure or vocabulary?
- [ ] Is it compatible with docs/canon/ux-gate-page.md?

If any answer is "yes" — the PR must be rejected.

source .venv/bin/activate && pytest -q
