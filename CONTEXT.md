# CPU scheduling tutor

This glossary names the concepts used in the scheduling exercises.

## Language

**Process**:
A generated job identified as P1, P2, and so on, with an arrival time and one CPU burst.

**Process set**:
The processes and their input values shared by one or more scheduling attempts.

**Attempt**:
A learner's schedule and metric answers for one process set under one scheduling algorithm.

**Arrival time**:
The time at which a process becomes eligible for CPU execution.

**CPU burst time**:
The total CPU time a process needs to finish.

**Priority**:
An optional integer from 1 through 10 assigned to a process. A higher value means that the process has higher priority.

**Priority-effect setting**:
The rule for using process priorities with FCFS, SJF, or RR: priority breaks ties in the algorithm's usual rule, or priority ranks processes before that rule.

**Execution interval**:
A continuous span of time during which one process uses the CPU. A preempted process can have several execution intervals.

**Schedule**:
An ordered set of execution intervals and any idle intervals for one CPU.

**Ready queue**:
The ordered processes that have arrived and are waiting for CPU time.

**Time quantum**:
The maximum continuous CPU time allocated to a process during one round-robin turn, unless it finishes sooner.

**Completion time**:
The time at which a process finishes its CPU burst.

**Turnaround time**:
The duration from a process's arrival to its completion.

**Waiting time**:
The time a process spends ready but not executing, assuming one CPU burst and no I/O.

**Response time**:
The duration from a process's arrival to its first execution.
