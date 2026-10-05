import { defineConfig } from "vite-plus"

/** packages/common：纯逻辑包，node 环境即可（money / api-error / category 等工具的单元测试） */
export default defineConfig({
    test: {
        name: "@shop/common",
        // isolate 必须落在 project 自己的 test 块：根配置的 `projects` 是 config 文件引用，
        // Vitest 不为这种 project 继承根 test 选项。理由与实测见 docs/conventions/frontend.md「迭代性能」。
        isolate: false,
        // https://vitest.dev/guide/migration/#clearmocks-is-enabled-by-default
        environment: "node",
        include: ["src/**/*.test.ts"],
    },
})
