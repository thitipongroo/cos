---
name: devops-monitoring
description: Define what to measure and what to alert on so failures are noticed before users report them. Use when standing up a service, or when incidents are being found by customers.
allowed-tools:
  - "Read"
  - "Glob"
  - "Grep"
  - "Write"
  - "Edit"
---

# Monitoring

Monitor what users experience. Resource graphs explain an incident; they rarely
detect one.

## What to measure first

- **Rate** - requests per second
- **Errors** - the proportion failing
- **Duration** - latency at p95 and p99, never the mean
- **Saturation** - how full the constrained resource is

For anything queue-based, add depth and consumer lag. For anything scheduled, add
whether it ran at all - a job that silently stops running is invisible to every
other metric.

## Alerting

- **Alert on symptoms, page on impact.** High CPU is a symptom; failing checkout
  is impact. Only impact should wake someone
- **Every alert names the action.** An alert nobody can act on trains people to
  ignore alerts
- **Tune for the alert nobody investigates.** That is the one killing the value
  of the whole system
- **Alert on absence** - no traffic, no completed job, no heartbeat. Silence is a
  failure mode that thresholds miss

## Dashboards

One overview per service that answers "is it healthy" in five seconds, with the
detail a layer down. A dashboard with forty panels is read by nobody during an
incident.

## Rules

- An unmonitored service is not in production, whatever the deploy log says
- Record what each alert means and what to do, next to the alert itself
