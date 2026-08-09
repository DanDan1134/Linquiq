# Copilot Assistant Guidelines for CSE120 Repositories

These instructions help AI assistants (like GitHub Copilot Chat) provide higher-quality, course-appropriate suggestions.

## Repository Context
- Course: CSE120 Operating Systems
- Typical domains: process scheduling, synchronization, memory management, file systems, concurrency, testing harnesses.
- Students should learn core OS concepts—AI must not produce full assignment solutions if such solutions undermine learning objectives.

## Semantic Commit Message Conventions
Format:
```
<type>(optional scope): <imperative summary>
```
Examples:
```
feat(scheduler): implement multi-level feedback queues
fix(memory): correct off-by-one in frame allocation
refactor: extract pcb initialization helper
test(locks): add contention stress test
```
Allowed types: feat, fix, docs, refactor, test, chore, perf, build, ci, style.

Rules:
1. Use present-tense imperative ("add", not "adds" or "added").
2. Keep summary <= 72 chars.
3. Reference Issues in body: include a line such as "Closes issue number" followed by the numeric reference (example: Closes issue 42).
4. Optional body paragraphs explain rationale, not restating code.
5. Avoid committing generated binaries or large outputs.

## Pull Request Assistance
When drafting a PR description, include:
- Problem statement
- Approach summary
- Testing evidence (commands + results)
- Risks / assumptions

Prompt template for students to use with Copilot:
```
Generate a PR description given these changes:
<X lines of git diff>
Focus on: purpose, design choices, tests added, risks.
```

## Issue Authoring Patterns
Bug report triage notes Copilot may help with:
- Reproduction script generation
- Hypothesis enumeration
- Suggesting logging points

Design / discussion Issues:
```
Goal: <what we want>
Constraints: <time, performance, correctness>
Options: <A/B/C with pros/cons>
Preferred: <current leaning>
Open Questions: <list>
```

## Code Suggestion Guardrails
Copilot should:
- Prefer clarity over premature optimization.
- Avoid introducing undefined behavior, race conditions, or dynamic memory misuse.
- Suggest test cases for edge conditions (empty queues, max processes, deadlock scenarios).
- Encourage incremental, test-driven development.

Copilot should NOT:
- Provide full solution code for graded assignments without user-provided partial work.
- Fabricate performance claims or benchmarks.
- Remove essential synchronization primitives.

## Testing Guidance for Suggestions
When the user requests help testing:
- Propose both functional and stress tests.
- Suggest instrumentation (timing, counters, conditional debug logging guards).
- Cover failure paths (allocation failure, invalid pointers, boundary indices).

## Documentation Expectations
Encourage:
- Brief module-level doc comments summarizing responsibility.
- Function headers: purpose, inputs, outputs, side effects, error modes.
- Diagrams via Mermaid or PlantUML for complex flows.

## Helpful Prompt Examples
Ask Copilot:
```
Suggest edge cases to test for a round-robin scheduler with time quantum Q.
Refactor this mutex acquisition code for clarity while preserving semantics.
Propose a semantic commit message for these staged changes: <git diff>.
Generate a stress test outline for N producer / M consumer threads.
```

## Academic Integrity Reminder
If a prompt might solicit a full assignment solution, Copilot should encourage the student to attempt the design first and request help on specific components.

---
These guidelines may be extended by instructors—keep this file updated.
