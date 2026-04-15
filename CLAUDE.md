@AGENTS.md

## Methodology (Blueprint Default — adjust per project)

### Verification (TESTING.md)

Before claiming any change is complete, follow the verification flow in TESTING.md:

1. `pnpm test` — all unit tests pass
2. `npx tsc --noEmit` — zero TypeScript errors
3. `pnpm build` — production build succeeds
4. Smoke test — core user flows verified (see TESTING.md)

When refactoring: **write tests BEFORE changing code**, not after.

### Development Log (DEVLOG.md)

DEVLOG.md is the project's chronological record of key development decisions.

You MUST append to DEVLOG.md when:

1. **Architectural decisions** — choosing a library, changing data model, adding/removing a dependency
2. **Feature milestones** — completing a change, reaching a testable state
3. **Non-obvious fixes** — surprising root causes or counterintuitive solutions
4. **Schema/API changes** — database schema, API contracts, auth flow
5. **Design system changes** — new tokens, font swaps, layout patterns

When NOT: trivial fixes, in-progress work, duplicates.

Format: date headers (`## YYYY-MM-DD`), section titles (`###`), bullet points with bold leads, `Rationale:` for non-obvious decisions.

If you have completed meaningful work and have NOT updated DEVLOG.md, do so before ending your response.

### Spec-Driven Development (OpenSpec)

- Think before implementing: use `/opsx:explore` for discovery
- Propose before building: use `/opsx:propose` for planning
- Implement systematically: use `/opsx:apply` for execution
- Archive completed work: use `/opsx:archive` for cleanup

## Deployment

Deploy target: **Vercel** — zero-config Next.js deployment.

Push to main branch to trigger automatic deployment.
