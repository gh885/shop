import viteReact from "@vitejs/plugin-react"
import { defineConfig } from "vite-plus"

/**
 * web 测试环境：jsdom + Testing Library。组件/集成测试在此跑；
 * 纯逻辑单测同样可用（jsdom 对它们只是多一层开销，不值得拆双环境配置）。
 * 注意：不挂 React Compiler 的 babel preset —— 测试断言行为，不断言渲染次数。
 */
export default defineConfig({
    resolve: { tsconfigPaths: true }, // 与 vite.config 一致：ui-web 内部的 shadcn 别名（src/lib/utils）靠 tsconfig paths 解析
    plugins: [viteReact()],
    test: {
        // https://vitest.dev/guide/migration/#clearmocks-is-enabled-by-default
        environment: "jsdom",
        setupFiles: ["@shop/app-kit/test/setup"],
        include: ["src/**/*.test.{ts,tsx}"],
        /**
         * 物流轨迹的用例断言的是 +08 的墙上时间串（formatNodeTime → app-kit formatTimeShort
         * 按宿主时区渲染，这是有意的产品行为）。不钉时区的话，同一份代码在本机 +08 绿、
         * 在 UTC 的 CI runner 上红 4 条（实测 Expected "07-26 09:06" / Received "07-26 01:06"）。
         * 钉在这里而不是 CI 步骤里：让本地任何时区的机器跑出的结果与 CI 一致。
         */
        env: { TZ: "Asia/Shanghai" },
    },
})
