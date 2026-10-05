import { defineConfig } from "vite-plus"

export default defineConfig({
    test: {
        name: "scripts",
        // isolate 必须落在 project 自己的 test 块：根配置的 `projects` 是 config 文件引用，
        // Vitest 不为这种 project 继承根 test 选项。理由与实测见 docs/conventions/frontend.md「迭代性能」。
        isolate: false,
        environment: "node",
        include: ["*.test.mjs"],
    },
})
