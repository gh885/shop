const { resolve } = require("node:path")

module.exports = {
    ci: {
        collect: {
            url: JSON.parse(process.env.PERF_URLS || "[]"),
            chromePath: process.env.CHROME_PATH,
            numberOfRuns: 3,
            settings: {
                configPath: resolve(__dirname, "lighthouse.config.mjs"),
                // 必须关沙箱：CI 跑在 ubuntu-latest（24.04+），AppArmor 禁掉了非特权 user namespace，
                // Chromium 拿不到可用沙箱就 FATAL "No usable sandbox!" 并以 signal 6 自杀，LHCI 侧只报
                // 一句 "Unable to connect to Chrome" —— 三个端全红、却看不出跟沙箱有关。
                //
                // 这不是我们比 Playwright 更激进：chromePath 指向的正是 Playwright 那份 Chromium，
                // 而 playwright-core 的默认就是「chromiumSandbox !== true ⇒ --no-sandbox」
                // （lib/coreBundle.js 里拼 chromium 启动参数那段），业务 E2E 一直这么跑、一直是绿的。
                // LHCI 走 chrome-launcher 自己拉起同一个二进制、不带这个参数，所以只有性能 job 红。
                //
                // 取值必须是字符串：LHCI 侧是 `chromeFlags || ''` 再拼 " --headless=new"（node-runner.js），
                // 传数组会被字符串拼接静默变成别的东西。
                chromeFlags: "--no-sandbox",
            },
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
