# Contributing Guidelines (CSE120 Student Repository)

> Adapt this file only if instructed. It encodes the expected workflow for this course.

## Workflow Overview
1. Open an Issue for every distinct unit of work (lab task, feature, bug, refactor, research).
2. Create a branch from `main` named after the Issue: `<type>/short-kebab` (e.g., `feat/scheduler-phase1`).
3. Commit changes incrementally with semantic commit messages.
4. Open a Pull Request early (draft) and link the Issue.
5. Request peer review (if required) before merging.
6. Squash merge or rebase to keep `main` linear (unless told otherwise).

## Semantic Commit Messages
Format:
```
<type>(optional scope): <imperative summary>
```
Allowed types:
- feat: new functionality
- fix: bug fix
- docs: documentation only
- style: formatting / lint (no logic)
- refactor: code restructuring w/o behavior change
- test: add or modify tests only
- chore: tooling / maintenance
- perf: performance improvement
- build: build system changes
- ci: continuous integration changes

Examples:
```
feat(scheduler): add round-robin dispatch loop
fix(memory): correct frame table bounds check
test(locks): add high-contention scenario
refactor: extract pcb init helper
```
Body (optional) should explain rationale, constraints, trade-offs. Reference Issues:
```
Closes issue 12
```

## Pull Requests
A PR should include:
- Clear title (semantic)
- Linked Issue(s)
- Summary of approach
- Testing evidence (commands + output snippet)
- Risks / potential regressions
- Checklist completion

### PR Checklist (Keep in Template)
- [ ] Follows semantic title
- [ ] Issue linked
- [ ] Builds / compiles locally
- [ ] Tests pass / added
- [ ] Docs updated
- [ ] No debug artifacts committed
- [ ] Reviewer(s) assigned (if required)

## Issue Labels (Suggested)
| Label | Purpose |
|-------|---------|
| bug | Defect in existing code |
| feat | New functionality |
| task | Maintenance, refactor, docs, infra |
| discussion | Design / conceptual thread |
| research | Investigation / exploration |
| urgent | High priority / blocking |
| lab | Lab-specific scope |

## Coding Practices
- Prefer clarity first; optimize only with justification.
- Add function/module doc comments: purpose, inputs, outputs, error modes, side effects.
- Avoid undefined behavior and data races.
- Make concurrency explicit (lock ordering, invariants documented).
- Add tests for boundary cases: empty queues, max capacity, invalid input, error paths.

## Testing Expectations
Write tests as you implement features. For performance-sensitive components (schedulers, memory allocators), include stress or time-measure harnesses if allowed.

## Academic Integrity
Do not copy full solutions. You may:
- Discuss high-level design strategies.
- Cite external references (papers, docs) in `docs/research/`.
You must not submit code you did not author (unless provided by instructor).

## Communication Patterns
Use Issues for traceability. Use Discussions or `discussion` Issues for architectural debates; summarize decisions in the Issue before closing.

## Tooling Suggestions (Optional)
If allowed, you may configure:
- Formatter (clang-format, black, etc.)
- Linting (cppcheck, clang-tidy)
- Pre-commit hooks for formatting / test runs

## Merging Strategy
Default: squash merge. Ensure final squash commit message follows semantic format.

## Handling Large Changes
Break into: parser, core logic, integration, tests. Submit sequential PRs each building on the last to reduce review load.

## Security / Safety
Never commit secrets, API keys, or private test data. Treat input as untrusted in user-facing utilities.

---
Questions? Open a `discussion` Issue before proceeding with uncertain design choices.
