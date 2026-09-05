import { defineConfig } from "@hey-api/openapi-ts"

export default defineConfig({
    input: "../../openapi/api-docs.json",
    output: "src/sdk",
    plugins: [
        {
            name: "@hey-api/client-ky",
            throwOnError: true,
        },
        {
            name: "@hey-api/sdk",
            responseStyle: "data",
            // 运行时用 zod 校验后端响应，schema 生成到 sdk/zod.gen.ts
            validator: {
                request: false,
                response: "zod",
            },

            operations: {
                strategy: "byTags",
                containerName: "{{name}}Api",
                // 后端 @Tag + 语义化方法名已规范：operationId 全局唯一，直接用作方法名
                nesting: "operationId",
            },
        },
        // 从契约 enum 生成 as const 对象 + 同名 type（如 ProductStatus）：
        // 用 javascript 模式而非 typescript-const，因为项目 tsconfig 开了 erasableSyntaxOnly（TS enum 语法被禁）
        {
            name: "@hey-api/typescript",
            enums: { mode: "javascript" },
        },
    ],
})
