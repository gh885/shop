import { defineConfig } from "@hey-api/openapi-ts"

export default defineConfig({
    input: "../../openapi/api-docs.json",
    output: "src/sdk",
    plugins: [
        "@hey-api/client-fetch",
        {
            name: "@hey-api/sdk",
            operations: {
                strategy: "byTags",
                containerName: "{{name}}Api",
                // 后端 @Tag + 语义化方法名已规范：operationId 全局唯一，直接用作方法名
                nesting: "operationId",
            },
        },
    ],
})
