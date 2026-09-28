import { defineConfig } from "vite-plus"

/**
 * Vitest monorepo 入口：以 workspace 内各包自己的 vitest.config.ts 为 project。
 * 没有测试配置的包自然不参与。
 * 运行：pnpm test（根目录）；单包：pnpm --filter web exec vitest run。
 */
export default defineConfig({
    test: {
        // https://vitest.dev/guide/migration/#clearmocks-is-enabled-by-default
        projects: ["apps/*/vitest.config.ts", "packages/*/vitest.config.ts"],
        /**
         * 不再为每个文件重起一份模块图。私有仓库的 ubuntu-latest 是 2 核 1G，117 个 jsdom
         * 文件按文件求值会把它压到 swap（同一份全量测试本地 28 线程 37s，CI 上 337s）。
         * 代价是同 worker 内文件共享模块状态，全局 mock 不回收会串味——所以这条要靠 CI 验，
         * 本地 986 条在 4 worker 下与 isolate 口径同绿（62.6s → 61.7s）。
         */
        isolate: false,
    },
})
