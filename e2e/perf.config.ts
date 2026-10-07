import { defineConfig } from "@playwright/test"
import { apps, localOrigin } from "../perf/scenarios.mjs"
import { API_URL } from "./fixtures/env"

localOrigin(API_URL)
export default defineConfig({
    testDir: "./performance",
    globalSetup: "./performance/setup.ts",
    timeout: 600_000,
    fullyParallel: false,
    workers: 1,
    retries: 0,
    forbidOnly: Boolean(process.env.CI),
    reporter: "line",
    outputDir: "../.artifacts/perf/playwright",
    projects: apps.map((app: { name: string }) => ({ name: app.name })),
    webServer: apps.map((app: { name: string; port: number }) => ({
        command:
            "pnpm --filter " + app.name + " exec vp preview --port " + app.port + " --strictPort",
        url: "http://localhost:" + app.port + (app.name === "web" ? "/welcome" : "/login"),
        reuseExistingServer: false,
        timeout: 60_000,
        stdout: "pipe" as const,
        stderr: "pipe" as const,
    })),
})
