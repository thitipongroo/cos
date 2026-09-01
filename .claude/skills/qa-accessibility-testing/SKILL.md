---
name: qa-accessibility-testing
description: Test whether people using assistive technology can complete the same tasks as everyone else - keyboard, screen reader, contrast, motion and focus. Use before shipping any user-facing surface.
allowed-tools:
  - "Read"
  - "Glob"
  - "Grep"
  - "Bash"
---

# Accessibility Testing

Automated tools catch roughly a third of what matters. The rest requires
operating the interface the way someone else would.

## Automated pass

Run the project's checker over every changed surface. Treat the result as the
floor, not the finish line.

## Manual pass - the part that finds real problems

1. **Keyboard only.** Unplug the mouse. Can you reach and operate everything, in
   a sensible order? Is focus always visible? Does a modal trap focus and return
   it on close?
2. **Screen reader.** Does each control announce a name, a role and a state? Are
   images described or explicitly decorative? Do live regions announce changes?
3. **Zoom to 200% and 400%.** Does content reflow, or does it clip and scroll in
   two directions?
4. **Contrast** - measure text at 4.5:1 and interface elements at 3:1. Include
   the focus ring, and include text over images
5. **Motion** - does the interface respect a reduced-motion preference?
6. **Colour** - is anything communicated by colour alone? Check status and error
   states in particular

## Reporting

Per finding: the element, the barrier, who it blocks, and the criterion it fails.
Rank by whether it blocks a task or slows it.

## Rules

- Never report a clean automated scan as accessible
- A workaround that requires a mouse is not a workaround
