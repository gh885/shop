const { resolve } = require("node:path")

module.exports = {
    ci: {
        collect: {
            url: JSON.parse(process.env.PERF_URLS || "[]"),
            chromePath: process.env.CHROME_PATH,
            numberOfRuns: 3,
            settings: { configPath: resolve(__dirname, "lighthouse.config.mjs") },
        },
        assert: {
            assertions: {
                "shop-page-ready": ["error", { minScore: 1, aggregationMethod: "pessimistic" }],
                "http-status-code": ["error", { minScore: 1, aggregationMethod: "pessimistic" }],
                "largest-contentful-paint": [
                    "warn",
                    { maxNumericValue: 2500, aggregationMethod: "median" },
                ],
                "cumulative-layout-shift": [
                    "warn",
                    { maxNumericValue: 0.1, aggregationMethod: "median" },
                ],
                "total-blocking-time": [
                    "warn",
                    { maxNumericValue: 200, aggregationMethod: "median" },
                ],
            },
        },
        upload: { target: "filesystem", outputDir: "reports" },
    },
}
