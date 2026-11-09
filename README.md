# CPU Scheduling Lab

An interactive React and TypeScript worksheet for practicing CPU scheduling for an undergraduate Operating Systems exam.

## Run locally

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. Run `npm test` for scheduler and React interaction tests, then `npm run build` to create a static site in `dist/`. Run `npm run test:browser` after building to check desktop controls and the mobile timeline in Chromium. That command needs a Playwright Chromium browser installed on the machine.

The app stores the current process set and attempts in browser local storage. It does not require an account or server.

## Exercise flow

Choose an algorithm, build the timeline, place the Finish marker, enter completion and other scheduling times, then check your work. After one check, the worked solution becomes available. The gear menu contains difficulty and optional priority rules. `requirements.md` defines the exercise and grading conventions.
