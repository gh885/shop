import { spawnSync } from "node:child_process"
import { randomBytes } from "node:crypto"
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, describe, expect, it } from "vite-plus/test"

const root = resolve(import.meta.dirname, "..")
const cli = fileURLToPath(new URL("bin.js", import.meta.resolve("size-limit/package.json")))
const budget = JSON.parse(readFileSync(join(root, "perf/size-limit.json"), "utf8"))
const temporaryDirectories = []

afterEach(() => {
    for (const directory of temporaryDirectories.splice(0)) {
        if (
            dirname(directory) !== resolve(tmpdir()) ||
            !directory.startsWith(join(resolve(tmpdir()), "shop-size-limit-"))
        ) {
            throw new Error("Refusing to remove a directory outside the test workspace")
        }
        rmSync(directory, { recursive: true, force: true })
    }
})

function fixture() {
    const directory = mkdtempSync(join(resolve(tmpdir()), "shop-size-limit-"))
    temporaryDirectories.push(directory)
    const checks = budget.map((check) => ({
        ...check,
        path: check.path.replace("../apps/", "./apps/"),
    }))
    const files = checks.map((check) => {
        const file = resolve(directory, check.path.replace("**/*", "assets/entry"))
        mkdirSync(dirname(file), { recursive: true })
        writeFileSync(
            file,
            file.endsWith(".js") ? 'export const value = "fixture";' : "body { color: black; }",
        )
        return file
    })
    const config = join(directory, "size-limit.json")
    writeFileSync(config, JSON.stringify(checks))
    return { directory, config, files }
}

function check(config) {
    return spawnSync(process.execPath, [cli, "--config", config, "--json"], {
        cwd: root,
        encoding: "utf8",
        timeout: 15_000,
    })
}

describe("Size Limit production budget", () => {
    it("covers every client JS/CSS group and the SSR JS separately", () => {
        expect(budget.map((entry) => entry.path)).toEqual([
            "../apps/web/dist/client/**/*.js",
            "../apps/web/dist/client/**/*.css",
            "../apps/web/dist/server/**/*.js",
            "../apps/seller/dist/**/*.js",
            "../apps/seller/dist/**/*.css",
            "../apps/admin/dist/**/*.js",
            "../apps/admin/dist/**/*.css",
        ])
        for (const entry of budget) {
            expect(entry.gzip).toBe(true)
            expect(entry.limit).toMatch(/^[1-9]\d* B$/)
        }
    })

    it("passes valid outputs and excludes source maps and analyzer reports", () => {
        const { config, files } = fixture()
        const before = check(config)
        expect(before.status).toBe(0)
        writeFileSync(files[0] + ".map", randomBytes(2_000_000))
        writeFileSync(join(dirname(files[0]), "report.html"), randomBytes(2_000_000))
        const after = check(config)
        expect(after.status).toBe(0)
        expect(JSON.parse(after.stdout)).toEqual(JSON.parse(before.stdout))
        expect(JSON.parse(after.stdout)).toHaveLength(budget.length)
    })

    it("rejects an oversized lazy chunk even when the entry itself is small", () => {
        const { config, files } = fixture()
        writeFileSync(
            join(dirname(files[0]), "lazy-route.js"),
            'export default "' + randomBytes(1_500_000).toString("hex") + '";',
        )
        const result = check(config)
        expect(result.status).toBe(1)
        expect(JSON.parse(result.stdout)[0].passed).toBe(false)
    })

    it.each([0, 1, 2, 3, 4, 5, 6])(
        "rejects missing required output group %i instead of counting it as zero",
        (index) => {
            const { config, files } = fixture()
            rmSync(files[index])
            const result = check(config)
            expect(result.status).toBe(1)
        },
    )

    it("rejects a missing config instead of running without limits", () => {
        const { directory } = fixture()
        const result = check(join(directory, "absent.json"))
        expect(result.status).toBe(1)
    })

    it("rejects unsupported analyzer arguments before starting builds", () => {
        const result = spawnSync(
            process.execPath,
            [join(root, "scripts/perf-analyze.mjs"), "--why"],
            {
                cwd: root,
                encoding: "utf8",
            },
        )
        expect(result.status).toBe(1)
        // 断言脚本给出的合法参数枚举（源于 perf-analyze.mjs 的 apps 常量），不锁 pnpm 命令名——
        // 命令名改了不该让这个测试红。
        expect(result.stderr).toContain("[web|seller|admin]")
    })
})
