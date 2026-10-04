import { defineConfig } from "vite-plus"

/**
 * Vitest monorepo 入口：以 workspace 内各包自己的 vitest.config.ts 为 project。
 * 没有测试配置的包自然不参与。
 * 运行：pnpm test（根目录）；单包：pnpm --filter web exec vitest run。
 */
export default defineConfig({
    test: {
        // https://vitest.dev/guide/migration/#clearmocks-is-enabled-by-default
        projects: [
            "apps/*/vitest.config.ts",
            "packages/*/vitest.config.ts",
            "scripts/vitest.config.ts",
        ],
        /**
         * 不再为每个文件重起一份模块图。私有仓库的 ubuntu-latest 只有 2 核 1G，117 个 jsdom
         * 文件按文件求值是在把 runner 往 swap 里推：CI 上开隔离 337 s、关隔离 203 s（整轮
         * 412 s → 260 s）。本地省下的可以忽略（62.6 s → 61.7 s），这条是给 CI 的。
         * 代价是同 worker 内文件共享模块状态，全局 mock 不回收会串味——986 条在 2 核 runner
         * 上全绿，先钉住；哪天出现「单跑绿、全量红」，先怀疑这里。
         */
        isolate: false,
    },
})
