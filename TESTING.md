# Requirements verification

Run `npm test`, `npm run build`, then `npm run test:browser`. The browser test serves the production build locally and needs Playwright Chromium installed.

| Requirement area | Verification |
| --- | --- |
| FCFS, SJF, preemptive SJF, RR, and both Priority Scheduling forms | `src/scheduler.test.ts` checks representative schedules, tie rules, preemption, RR queue order, idle time, and metrics. |
| Generated problem limits and required scheduling events | `src/scheduler.test.ts` samples every difficulty, algorithm, and priority mode, then checks process counts, bounds, completion, and required event counts. |
| Priority rules | `src/scheduler.test.ts` checks tie-breaking, priority-first choices, and preemption. `src/App.interaction.test.tsx` checks the settings controls and saved attempts by mode. |
| Timeline entry and grading | `src/App.interaction.test.tsx` checks cell entry, keyboard shortcuts, drag/drop handling, run resizing, Finish rules, missing and wrong states, and a complete correct answer. The Chromium test performs a real drag. |
| Metrics, formula help, and worked solution | `src/App.interaction.test.tsx` checks per-process answers, average fractions and tolerance, hidden formula help, feedback, solution contents, and solution-viewed state. |
| Saving, settings, and timer | `src/App.interaction.test.tsx` checks reload, attempt switching, replacement confirmations, timer pause and resume, and timer stop on completion. |
| Phone layout and touch placement | `scripts/browser-smoke.mjs` checks the mobile grid width, Finish alignment, horizontal scrolling, full-width panels, and touch placement in Chromium mobile emulation. |

The browser test uses mobile emulation. A physical phone is still needed to judge touch comfort and text size before wider sharing. MLFQ and the learner-built queue table are deferred in `requirements.md` and are outside this test pass.
