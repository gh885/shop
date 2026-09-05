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
        // 生成每个 GET 的 queryOptions / queryKey 与 mutation 的 mutationOptions，
        // 供 TanStack Query 直接使用（走同一 client，拦截器照常生效）。
        // infinite 生成对对象型分页参数（pageParams.page）会产出非法点号路径键，关闭；
        // 无限滚动将来在业务层手写 queryFn 组装
        {
            name: "@tanstack/react-query",
            infiniteQueryKeys: false,
            infiniteQueryOptions: false,
        },
    ],
})
