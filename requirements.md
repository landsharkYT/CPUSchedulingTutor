# CPU scheduling tutor requirements

Status: confirmed on 2026-11-08.

## Purpose

Build a deployable React and TypeScript web app for practicing CPU scheduling for an undergraduate Operating Systems exam completed on paper. A learner receives a generated process set, constructs a schedule on an interactive timeline, calculates scheduling metrics, and checks the result. The app can then generate another problem.

The exercise should resemble the work the learner must show on paper: read a process table, draw and label a CPU timeline, then calculate per-process values and averages. The app may use drag, tap, and keyboard controls to enter that work, but its answer format should remain recognizable as an exam solution. Checking and worked solutions stay hidden until the learner chooses them.

## First-release scope

### Problem generation

- Generate processes labeled P1, P2, P3, and so on.
- Show each process's arrival time and CPU burst time in a table similar to the first reference image.
- Support first-come, first-served (FCFS), shortest job first without preemption, shortest remaining time first (SJF with preemption), and round robin (RR).
- Generate one RR time quantum for each process set, using the difficulty ranges below. Keep it fixed if the learner switches to RR or returns to an RR attempt on that set.
- Offer Easy, Medium, and Hard difficulty settings. Easy uses 3–4 processes and few interruptions. Medium uses 4–5 processes with overlapping arrivals. Hard uses 5–7 processes with ties, idle gaps, and several preemptions or RR turns when the selected algorithm permits them.
- Use these inclusive ranges and workload caps:

  | Difficulty | Arrival time | Burst time | Total burst cap | RR quantum |
  | --- | ---: | ---: | ---: | ---: |
  | Easy | 0–4 | 1–6 | 14 | 2–3 |
  | Medium | 0–8 | 1–8 | 25 | 2–4 |
  | Hard | 0–12 | 1–10 | 40 | 1–4 |

- Generate a case that exercises the selected algorithm. Nonpreemptive SJF needs a real choice among ready processes; preemptive SJF needs at least one preemption; RR needs at least one rotation of an unfinished process.
- Guarantee the distinctive event for the algorithm and settings selected when generating the process set. Reusing the set with another algorithm or priority-effect setting is for comparison and does not promise that combination's distinctive event.
- Include at least one process arriving at time 0. Number processes in arrival order. For simultaneous arrivals, use their generated order to assign process numbers.
- Hard nonpreemptive SJF problems need at least two choices among ready processes; Hard preemptive SJF needs at least two preemptions; Hard RR needs at least two rotations of unfinished processes. Hard FCFS needs at least one waiting process and a later idle gap.
- When priority is on, generate at least one decision where priority changes the schedule for the originally selected algorithm and priority-effect setting. For nonpreemptive Priority Scheduling on Hard, include at least two dispatch decisions where priority decides among ready processes. For preemptive Priority Scheduling on Hard, include at least two preemptions caused by a higher-priority arrival.
- In Priority first mode, also guarantee at least one decision among equal-priority processes where the selected algorithm's normal rule determines the schedule. This keeps hybrid exercises focused on both rules.
- Each attempt uses one selected scheduling algorithm. Let the learner reuse the same process set with another algorithm for comparison.
- Keep separate attempts for each FCFS, SJF, or RR algorithm and priority-effect setting on the current process set. Keep one attempt for each form of Priority Scheduling; the priority-effect setting does not change that algorithm. Switching back restores answers.
- Generate a new problem on request.
- Changing difficulty generates a new process set. If any attempt on the current set is unfinished, confirm first and explain that its saved attempts will be discarded.

### Optional priority setting

- Place a gear icon in the top-right corner that opens exercise settings.
- Keep difficulty and priority controls in the gear menu. Keep algorithm choice beside the exercise.
- Include a toggle that adds a randomly generated integer priority from 1 through 10 to each process. Repeated values are allowed. A higher number means higher priority.
- When priority is on, show the priority column in the input table and offer both nonpreemptive and preemptive Priority Scheduling.
- When priority is on, show two mutually exclusive toggle controls for how priority affects FCFS, both SJF variants, and RR: **Tie-breaker** and **Priority first**. Select Tie-breaker by default.
- In Tie-breaker mode, priority only ranks candidates that the algorithm's main rule considers equal. For FCFS, compare processes with the same arrival time. For nonpreemptive SJF, compare equal CPU bursts among ready processes. For preemptive SJF, compare equal remaining times; a newly arrived process with equal remaining time and higher priority preempts the current process. For RR, rank processes that arrive at the same time before adding them to the queue; do not reorder processes already waiting. If priority is also equal, use arrival time, then process number.
- In Priority first mode, select the highest-priority ready process first, then apply the chosen algorithm's rule among processes with that priority. FCFS and nonpreemptive SJF do not interrupt a running process. Preemptive SJF interrupts when a newly ready process has a higher priority, or when it has the same priority and a shorter remaining time. RR rotates among processes at the highest ready priority; a newly arrived higher-priority process interrupts the running process immediately and returns it to its own priority level's queue. The interrupted process receives a fresh full quantum when it next runs.
- In Priority Scheduling, the nonpreemptive form runs the highest-priority ready process until completion. The preemptive form interrupts it when a higher-priority process arrives. Equal-priority arrivals do not preempt. Break equal-priority ties by arrival time, then process number.
- Keep the priority setting off by default so the original four algorithms retain the rules above.
- Changing the priority toggle generates a new process set. If any attempt on the current set is unfinished, confirm first and explain that its saved attempts will be discarded.
- Show the selected priority rule with each exercise. Label priority-first exercises as hybrid policies, such as "SJF + Priority first," so they are distinct from the standard exam algorithms.

### Solving the exercise

- Provide an interactive, time-marked timeline made of unit-length time cells for one CPU. Start with a short blank grid and let the learner extend it as needed. Do not reveal the correct final completion time through the grid length.
- Let the learner move a Finish marker to the end of the proposed schedule. Check cells before the marker; treat empty cells there as missing. Cells after the marker are workspace and do not count as answers.
- Let the learner drag a process label into a cell, then extend or resize its execution interval. Provide an explicit Idle label for gaps.
- Provide tap-based placement on touch devices and a keyboard method for the same actions.
- Allow a process to appear in multiple intervals when the scheduling policy preempts it or rotates it out.
- Let the learner edit an attempt before checking it.
- Allow schedule and metric entry in any order. Check both together on submission.
- Grade the process or Idle value assigned to each time cell. Splitting one correct run into adjacent intervals of the same process does not make the schedule wrong.
- Ask the learner to enter completion time, turnaround time, waiting time, and response time for every process, plus the average of turnaround, waiting, and response time.
- Accept an exact fraction or a decimal within 0.01 of the correct average. Show the accepted rounding rule beside the average fields.
- Keep formulas out of the normal exercise view. Reveal each formula through a tooltip on hover, focus, or tap.
- Check only when the learner submits. Mark incorrect timeline intervals and metric fields. Mark missing cells and fields separately from wrong answers, preserve the attempt, and allow another check.
- After a check, explain the first scheduling error in one sentence. Keep the full worked solution optional.
- Make the full worked solution available after the first check. The learner may keep editing after viewing it; record that the solution was viewed in the attempt.
- Show the full worked solution as a labeled Gantt chart; a table with arrival, burst, completion, turnaround, waiting, and response values; all three averages; and one sample calculation for each metric. Use a conventional paper-exam format rather than copying the supplied text diagram.
- Show an elapsed-time timer for each attempt. Start it on the first answer edit, pause it while the browser tab is hidden, and stop it when the attempt is complete. Save the elapsed time with the attempt and resume it when the learner returns. Viewing the solution does not stop the timer. There is no time limit or full exam mode in the first release.
- Mark an attempt complete only when the schedule and every metric answer are correct. Show whether the learner viewed the solution as a separate indicator; viewing it does not prevent completion.
- On phones, keep time cells at a usable width in a horizontally scrollable timeline. Keep the time scale and process labels visible while scrolling.
- Keep process data, metric answers, settings, and controls readable without clipped text or horizontal page scrolling at common phone, tablet, and desktop widths. The timeline may scroll horizontally because its time cells need a usable width.
- Offer Light and Dark appearance choices in the settings menu. Start in Light mode for a first-time visitor, apply the chosen theme throughout the app, and save it on this device across reloads and process-set changes.
- Save the current process set and its attempts, including completed attempts, on the device. A browser reload restores them. The first release does not keep a history of older generated process sets or require accounts.
- When the learner requests a new problem and any attempt on the current process set is unfinished, confirm first and explain that the process set and all its saved attempts will be discarded.
- Use an in-app confirmation dialog for process-set replacement triggered by New problem, difficulty changes, or the priority toggle. Do not use a native browser confirmation dialog. Cancel keeps the current problem and answers; when triggered from settings, both Cancel and Continue leave settings open.
- Run the first release entirely in the browser as a static app. Select a deployment host during implementation.

### Scheduling rules to specify

Each process has one CPU burst. There is no I/O or context-switch cost. With priority off, when ready processes tie under the selected algorithm, choose the one with the earlier arrival time, then the lower process number. Show the tie rule in every exercise. In preemptive SJF, a new process preempts the current one only when its burst is strictly shorter than the current process's remaining time.

In RR, when a quantum expires at the same time that new processes arrive, add the new arrivals to the ready queue before returning the unfinished process to its back. When the ready queue is empty, the CPU stays idle until the next arrival. State these conventions in the exercise instructions.

### Core metric definitions

- Completion time: the time when a process finishes its CPU burst.
- Turnaround time: completion time minus arrival time.
- Waiting time: turnaround time minus CPU burst time, assuming a single CPU burst and no I/O.
- Response time: time of first CPU execution minus arrival time.

Each metric uses the one-burst, no-I/O model defined above.

## Future scope

- Multilevel feedback queue (MLFQ) exercises with a configurable number of queues, RR policies in upper queues, and FCFS in the final queue.
- A generated Gantt-style schedule table and per-process statistics similar to the second reference image.
- A queue-state table showing when processes enter, move between, and complete in queues.
- An exercise mode where the learner builds the queue-state table through drag and drop.

MLFQ behavior needs a separate specification for queue entry, demotion, preemption by higher-priority queues, aging or promotion, and quantum reset before it can become a graded exercise.

## Implementation boundary

The first release does not include MLFQ or a learner-built queue-state table; those remain future work. Choose exact visual styling and the static deployment host during implementation.

## Reference images

- The first supplied image shows a process input table with process IDs, arrival times, and CPU burst times, followed by questions about FCFS, SJF, preemptive SJF, and RR.
- The second supplied image shows text-based RR and MLFQ execution tables with a time axis and turnaround-time calculations. It informs the future table view, not the initial interaction design.
