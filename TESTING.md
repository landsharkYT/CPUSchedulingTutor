# Requirements verification

Run `./test.sh` for the unit and React interaction tests plus a production build. Run `./test.sh --browser` to add the browser check. The browser test serves the production build locally and needs Playwright Chromium installed.

| Requirement area | Verification |
| --- | --- |
| FCFS, SJF, preemptive SJF, RR, and both Priority Scheduling forms | `src/scheduler.test.ts` checks representative schedules, tie rules, preemption, RR queue order, idle time, and metrics. |
| Generated problem limits and required scheduling events | `src/scheduler.test.ts` samples every difficulty, algorithm, and priority mode, then checks process counts, bounds, completion, and required event counts. |
| Priority rules | `src/scheduler.test.ts` checks tie-breaking, priority-first choices, and preemption. `src/App.interaction.test.tsx` checks the settings controls and saved attempts by mode. |
| Timeline entry and grading | `src/App.interaction.test.tsx` checks cell entry, keyboard shortcuts, drag/drop handling, run resizing, Run length, automatic row growth, Add/Remove row, direct Finish placement, missing and wrong states, and a complete correct answer. The Chromium test performs a real drag and extends through a row boundary. |
| Metrics, formula help, and worked solution | `src/App.interaction.test.tsx` checks per-process answers, average fractions and tolerance, hidden formula help, feedback, solution contents, and solution-viewed state. |
| Saving, settings, and timer | `src/App.interaction.test.tsx` checks reload, attempt switching, the custom discard dialog, saved theme, timer pause and resume, and timer stop on completion. The browser check rejects native browser dialogs. |
| Responsive layout and touch placement | `scripts/browser-smoke.mjs` checks page, table, and timeline overflow at 320, 390, 768, 1024, and 1280 pixels; formula tooltip bounds; Finish alignment at row breaks; wrapped worked solutions; theme persistence; and touch placement in Chromium mobile emulation. |
| MLFQ scheduling and generation | `src/mlfq.test.ts` checks RR upper queues and FCFS last queues across three to five levels, interruptions, preserved quantum, simultaneous arrival order, queue-state grading, and generated Easy/Medium/Hard limits and events. |
| MLFQ exercise flow | `src/MlfqExercise.interaction.test.tsx` checks a fully correct attempt, the worked solution, missing event feedback, discard cancellation, and family-specific difficulty changes. The browser check covers the guided example, event-row entry, family switching, settings, and mobile layout. |

The browser test uses mobile emulation. A physical phone is still needed to judge touch comfort and text size before wider sharing.
