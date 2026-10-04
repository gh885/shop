import { defineConfig } from "vite-plus"

export default defineConfig({
    test: {
        name: "scripts",
        environment: "node",
        include: ["*.test.mjs"],
    },
})
