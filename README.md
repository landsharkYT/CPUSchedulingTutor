# CPU Scheduling Lab

An interactive React and TypeScript worksheet for practicing CPU scheduling for an undergraduate Operating Systems exam.

## Run locally

```sh
./start.sh
```

Open the local URL printed by Vite. Press Ctrl+C to stop the server. The script installs locked dependencies with `npm ci` if they are missing.

Run `./test.sh` for scheduler and React interaction tests plus a production build. Run `./test.sh --browser` to add the desktop and mobile Chromium check. The browser check needs a Playwright Chromium browser installed on the machine.

The app stores the current process set and attempts in browser local storage. It does not require an account or server.

## Exercise flow

Choose an algorithm, build the timeline, place the Finish marker, enter completion and other scheduling times, then check your work. After one check, the worked solution becomes available. The gear menu contains difficulty and optional priority rules. `requirements.md` defines the exercise and grading conventions.
