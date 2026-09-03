# Catalog

Every agent and skill installed in this repository, by domain.
A reference to read, not a file that runs anything.

Each description below is the `description` field of the file that implements it, so this
catalogue and the running configuration cannot drift apart without one of them failing a check.

---

## Cross-domain

### doc-drift-researcher

`doc-drift-researcher` · agent

Read-only researcher that compares what the documentation claims against what the repository actually contains, and
returns the differences as findings. Use PROACTIVELY when checking whether docs, READMEs, or configuration references
have gone stale.

### phase-index

`phase-index` · skill

Use when a task names a Phase, or when you need to find which of the 25 Phase command files to read — maps each Phase
to its file, its dependencies and its SaaS Maturity Stage, and says where every cross-cutting specification and
numbered Rule now lives. Read only the files the task needs.

### spec-reading

`spec-reading` · skill

How to turn a written requirement into an exhaustive, verifiable task list — read line by line yourself, never delegate
the reading, tag each item, and prove completion with filesystem evidence. Load before planning any multi-step
deliverable.

### workspace-isolation

`workspace-isolation` · skill

Establish an isolated workspace before starting feature work — detect the isolation you already have, choose a branch or
a worktree deliberately, then prove the baseline is clean. Use before the first commit of any multi-step change.

### branch-completion

`branch-completion` · skill

Decide how finished work gets integrated — prove the suite is green, present the options, execute the one chosen, then
clean up. Use when implementation is complete and the branch needs to become a merge, a pull request, or nothing yet.

---

## 1. Engineering Agent

`engineering-agent` · routes 12 skills

Routes engineering work to the right method - writing code, reviewing it, refactoring, debugging, and every level of
testing. Use PROACTIVELY when the task is to change or verify a codebase.

### Code Generator Skill

`engineering-code-generator`

Write new code from a stated requirement — read the surrounding code first, match its conventions, and produce something
that compiles and is covered by tests. Use when asked to add a function, module, endpoint or component that does not
exist yet.

### Code Reviewer Skill

`engineering-code-reviewer`

Review a diff or file for defects that would survive the test suite — wrong behaviour, unhandled edge cases, security
and concurrency errors. Use before merging, or when asked whether a change is safe.

### Component Testing Skill

`engineering-component-testing`

Test a UI component in isolation — its rendering, its states, and its behaviour under interaction. Use when adding or
changing a component, before wiring it into a screen.

### Debugging Skill

`engineering-debugging`

Find the cause of a defect — reproduce it, narrow it, prove the cause, then fix. Use with an error message, a stack
trace, a failing test, or behaviour that diverges from what is expected.

### E2E Testing Skill

`engineering-e2e-testing`

Test a complete user journey through the running system, driving the real interface. Use for the few flows whose failure
would be unacceptable, not for broad coverage.

### Integration Testing Skill

`engineering-integration-testing`

Test units against their real collaborators — a real database, queue, cache or HTTP boundary. Use when the risk is in
the seams rather than in the logic.

### Mock Skill

`engineering-mock`

Replace a collaborator with a controlled stand-in so a unit can be tested in isolation. Use when a dependency is slow,
non-deterministic, or has side effects a test must not cause.

### Mock API Skill

`engineering-mock-api`

Stand up a fake HTTP service so callers can be developed and tested without the real one. Use when the upstream is
unavailable, rate-limited, expensive, or not yet built.

### Mock Database Skill

`engineering-mock-database`

Substitute the database in tests — with a fake repository, an in-memory engine, or a disposable real instance. Use when
tests need data without depending on a shared or slow database.

### Receiving Review Skill

`engineering-receiving-review`

Respond to review feedback — understand it, check it against this codebase, implement what holds and push back on what
does not. Use when a review, a bug report or a comment thread has arrived and before acting on any of it.

### Refactoring Skill

`engineering-refactoring`

Restructure existing code without changing what it does — extract, rename, deduplicate, simplify. Use when code is hard
to follow or repeated, and behaviour must stay identical.

### Unit Testing Skill

`engineering-unit-testing`

Write tests for a single unit in isolation — one function, class or module, with its collaborators replaced. Use when
adding or changing logic that can be exercised without I/O.

---

## 2. QA Agent

`qa-agent` · routes 12 skills

Routes quality work to the right method - test design and execution, bug triage, and performance, security,
accessibility, compatibility and load testing. Use PROACTIVELY when the task is to find defects or judge readiness.

### Accessibility Testing Skill

`qa-accessibility-testing`

Test whether people using assistive technology can complete the same tasks as everyone else - keyboard, screen reader,
contrast, motion and focus. Use before shipping any user-facing surface.

### Automation Testing Skill

`qa-automation-testing`

Build and maintain automated test suites that run unattended in CI - selection, structure, stability and speed. Use when
deciding what to automate, or when an existing suite is slow, flaky or ignored.

### Bug Triage Skill

`qa-bug-triage`

Assess incoming defect reports - reproduce, classify, prioritise and route. Use when a backlog of reports has built up,
or a new report needs a severity before anyone commits time to it.

### Compatibility Testing Skill

`qa-compatibility-testing`

Verify the product works across the browsers, devices, operating systems and versions it claims to support. Use before a
release, or when adopting a feature with uneven platform support.

### Load Testing Skill

`qa-load-testing`

Measure how the system behaves at expected and peak volume, sustained over time. Use before a launch, a campaign, or any
event with a known traffic increase.

### Performance Testing Skill

`qa-performance-testing`

Measure latency and throughput against a stated budget under expected conditions. Use when a budget exists and you need
to know whether the system meets it, or which part does not.

### Regression Testing Skill

`qa-regression-testing`

Verify that what worked before still works after a change. Use before a release, after a merge, and whenever a fixed
defect needs to stay fixed.

### Security Testing Skill

`qa-security-testing`

Probe an application for exploitable weaknesses - injection, broken access control, exposure of secrets and data. Use
before a release, after an auth change, or when a security review is required.

### Stress Testing Skill

`qa-stress-testing`

Push the system past its expected capacity to find where it breaks and how it behaves when it does. Use to establish
real limits, and to check that failure is graceful rather than catastrophic.

### Test Design Skill

`qa-test-design`

Decide what to test and at which level before any test is written - the cases, the boundaries, and what is deliberately
left uncovered. Use at the start of a feature, or when a suite is large but keeps missing defects.

### Test Execution Skill

`qa-test-execution`

Run a test suite and report what actually happened - passes, failures, skips, flakes and environment. Use when
validating a change, a release candidate, or a suite whose results are being questioned.

### Test Reporting Skill

`qa-test-reporting`

Turn raw test results into something a team can act on - trends, blockers, risk areas, and what to do next. Use for
release readiness, sprint reporting, or when leadership asks whether quality is improving.

---

## 3. Documentation Agent

`doc-agent` · routes 6 skills

Routes documentation work to the right method - API reference, user guides, code examples, release notes, migration
guides and knowledge base articles. Use PROACTIVELY when the task is to write or fix documentation.

### API Documentation Skill

`doc-api-documentation`

Document an HTTP or library API so a caller can use it without reading the source - endpoints, parameters, responses,
errors and auth. Use when shipping an API surface or when integrators keep asking the same questions.

### Code Example Skill

`doc-code-example`

Write runnable examples that show how to use an API, library or pattern correctly. Use alongside reference
documentation, or when adoption is slow because nobody can see how the pieces fit.

### Knowledge Base Skill

`doc-knowledge-base`

Build and maintain a searchable body of answers - troubleshooting, how-tos, decisions and their reasons. Use when the
same questions keep being answered in chat and the answers are lost.

### Migration Guide Skill

`doc-migration-guide`

Write instructions for moving from one version, system or approach to another - the steps, the order, and the way back.
Use for a breaking change, a platform move, or a deprecation with a deadline.

### Release Notes Skill

`doc-release-notes`

Write release notes that tell users what changed and what they must do about it. Use at every release, and always when
something breaks compatibility.

### User Guide Skill

`doc-user-guide`

Write task-based documentation for people using the product - how to accomplish something, start to finish. Use when a
feature ships, or when support answers the same question repeatedly.

---

## 4. DevOps Agent

`devops-agent` · routes 6 skills

Routes operational engineering to the right method - pipelines, deployment, monitoring, logging, infrastructure as
code and operational security. Use PROACTIVELY when the task concerns how software is built, shipped or run.

### CI CD Skill

`devops-ci-cd`

Design and maintain the pipeline that builds, tests and delivers every change - stages, gates, caching and speed. Use
when setting up CI, or when a pipeline is slow, flaky, or being routinely bypassed.

### Deployment Skill

`devops-deployment`

Get a built artefact into an environment safely - strategy, health checks, rollback and verification. Use when shipping
to production, or when a deployment process has caused an outage.

### Infrastructure Skill

`devops-infrastructure`

Define and change infrastructure as code - networks, compute, storage, and the state that describes them. Use when
provisioning an environment, or when changes are being made by hand.

### Logging Skill

`devops-logging`

Decide what to log, in what shape, and for how long - so an incident can be reconstructed without guessing. Use when
adding a service, or when logs exist but never answer the question.

### Monitoring Skill

`devops-monitoring`

Define what to measure and what to alert on so failures are noticed before users report them. Use when standing up a
service, or when incidents are being found by customers.

### Security Skill

`devops-security`

Harden the running system and its supply chain - secrets, access, dependencies, network and configuration. Use when
setting up infrastructure, before a security review, or after an exposure.
