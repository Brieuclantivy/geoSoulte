# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

To talk to me, always start by saying 'Ay Ay Captain'

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:

- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Marking and Deleting Temporary Files

**Never delete a file or folder you didn't create in this conversation without asking first — not even if it looks like leftover debris.**

- Only assume a file/folder is safe to delete if you personally created it earlier in the current conversation, or it's named `xxx-claude-test-*` (see below).
- When you create your own temporary files/folders in the project (scratch scripts, verification copies, staging directories — not applicable to the scratchpad directory outside the repo), prefix the top-level name `xxx-claude-test-` (e.g. `resultats/xxx-claude-test-verif/`, or `xxx-claude-test-check.ts` for a single file). Anything named `xxx-claude-test-*` is understood to be freely yours to delete later, by you or a future session.
- If you find a file or folder that looks like debris but does NOT follow that naming convention, its origin is unknown — stop and ask the user before touching it. Do not infer ownership from timing, content, or "this looks like something an agent would produce."
- This applies even under time/token pressure, and even mid-cleanup step of an otherwise-approved task — deleting the wrong thing is irreversible; asking costs one exchange.

## 5. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:

- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:

```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

## Agent skills

### Issue tracker

Les tickets et specs sont des issues GitHub sur Brieuclantivy/geoSoulte, gérées avec le CLI `gh`. See `docs/agents/issue-tracker.md`.

### Triage labels

Labels par défaut : needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context : `CONTEXT.md` et `docs/adr/` à la racine. See `docs/agents/domain.md`.
