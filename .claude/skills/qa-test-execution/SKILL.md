---
name: qa-test-execution
description: Run a test suite and report what actually happened - passes, failures, skips, flakes and environment. Use when validating a change, a release candidate, or a suite whose results are being questioned.
allowed-tools:
  - "Read"
  - "Glob"
  - "Grep"
  - "Bash"
---

# Test Execution

A run is only evidence if someone else could reproduce it. Record enough that
they could.

## Before running

State the commit, the branch, the environment and the command. A result without
these cannot be compared to any other result.

## Running

- Run the full suite the project defines, not a subset you chose, unless the task
  says otherwise - and then say which subset
- Do not retry a failure to see if it passes. Record it, then investigate
- Capture the output. A summary line without the failure detail is not a report

## Reporting

```
commit   <sha>        environment  <name>
command  <exact>      duration     <time>
passed N   failed N   skipped N   flaky N
```

Then, per failure: the test name, the assertion, and the first line of the trace
that points into project code rather than into the framework.

## Rules

- **A skipped test is not a passing test.** List every skip and why it skipped -
  suites accumulate permanent skips that nobody notices
- **A flake is a failure.** Report it as flaky with the run count, never as green
- **Never report a partial run as a pass.** If the suite was cut short, say where
  it stopped
- Do not edit a test to make a run green. That is a separate decision, with a
  separate justification
