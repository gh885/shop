import { defineConfig, devices } from "@playwright/test"

const webURL = process.env.E2E_WEB_URL ?? "http://localhost:3000"

export default defineConfig({
    testDir: "./tests",
    outputDir: "./test-results",
    fullyParallel: false,
    forbidOnly: Boolean(process.env.CI),
    retries: process.env.CI ? 1 : 0,
    workers: 1,
    reporter: process.env.CI ? [["line"], ["html", { open: "never" }]] : [["list"]],
    use: {
        baseURL: webURL,
        trace: "retain-on-failure",
        screenshot: "only-on-failure",
        video: "retain-on-failure",
    },
    projects: [
        {
            name: "auth",
            testMatch: /auth\.setup\.ts/,
            use: { ...devices["Desktop Chrome"] },
        },
        {
            name: "chromium",
            dependencies: ["auth"],
            use: {
                ...devices["Desktop Chrome"],
                storageState: "e2e/playwright/.auth/buyer.json",
            },
        },
    ],
})
