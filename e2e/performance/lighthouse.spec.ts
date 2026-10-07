import { execFile } from "node:child_process"
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import { chromium, expect, test } from "@playwright/test"
import { ADMIN_EMPLOYEE_NO, ADMIN_PASSWORD, API_URL } from "../fixtures/env"
import { readManifest } from "../fixtures/run"
import { getScenario, measurementIsValid } from "../../perf/scenarios.mjs"

const execute = promisify(execFile)
const root = resolve(import.meta.dirname, "../..")
const cli = fileURLToPath(new URL("src/cli.js", import.meta.resolve("@lhci/cli/package.json")))

test("Lighthouse CI validates every sample and reports performance budgets", async () => {
    const info = test.info()
    const fixture = await readManifest()
    const app = info.project.name
    const env = {
        ...process.env,
        PERF_APP: app,
        PERF_PRODUCT_ID: fixture.product.productId,
        PERF_PRODUCT_NAME: fixture.product.name,
        PERF_ORDER_NO: fixture.order.orderNo,
        PERF_SHOP_NAME: fixture.seller.shopName,
        PERF_ACCOUNT: app === "admin" ? ADMIN_EMPLOYEE_NO : fixture.seller.phone,
        PERF_PASSWORD: app === "admin" ? ADMIN_PASSWORD : fixture.seller.password,
        E2E_API_URL: API_URL,
        CHROME_PATH: chromium.executablePath(),
    }
    const scenario = getScenario(env)
    const directory = resolve(root, ".artifacts/perf/lighthouse", app)
    await mkdir(directory, { recursive: true })
    // autorun 的重复采样、聚合、断言、HTML/JSON 输出全部由 LHCI 执行。
    let result
    try {
        result = await execute(
            process.execPath,
            [cli, "autorun", "--config=" + resolve(root, "perf/lighthouserc.cjs")],
            {
                cwd: directory,
                env: {
                    ...env,
                    PERF_URLS: JSON.stringify(
                        scenario.pages.map(
                            (page: { path: string; query: string }) =>
                                scenario.origin + page.path + (page.query ? "?" + page.query : ""),
                        ),
                    ),
                },
                maxBuffer: 20 * 1024 * 1024,
                timeout: 540_000,
            },
        )
    } catch (error) {
        // 不输出环境变量或登录响应；只保存 LHCI 的诊断文本。
        if (error && typeof error === "object" && "stdout" in error && "stderr" in error) {
            await writeFile(
                resolve(directory, "lhci.log"),
                String(error.stdout) + String(error.stderr),
            )
        }
        // autorun 在断言失败后不会 upload；失败样本也必须有 HTML/JSON 现场。
        try {
            await execute(
                process.execPath,
                [cli, "upload", "--config=" + resolve(root, "perf/lighthouserc.cjs")],
                { cwd: directory, env, timeout: 30_000 },
            )
        } catch {
            // 没有采集到任何样本时无法导出；保留原始失败，不把诊断失败盖到它上面。
        }
        throw error
    }
    await writeFile(resolve(directory, "lhci.log"), result.stdout + result.stderr)
    console.log(result.stdout)
    const manifest: unknown = JSON.parse(
        await readFile(resolve(directory, "reports/manifest.json"), "utf8"),
    )
    expect(manifest).toHaveLength(scenario.pages.length * 3)
    const samples = (await readdir(resolve(directory, ".lighthouseci"))).filter((name) =>
        /^lhr-.*\.json$/.test(name),
    )
    expect(samples).toHaveLength(scenario.pages.length * 3)
    const validity = await Promise.all(
        samples.map(async (name) => ({
            name,
            valid: measurementIsValid(
                JSON.parse(await readFile(resolve(directory, ".lighthouseci", name), "utf8")),
            ),
        })),
    )
    expect(validity.filter((sample) => !sample.valid)).toEqual([])
})
