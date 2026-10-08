import { fileURLToPath } from "node:url"
import { defineConfig } from "@hey-api/openapi-ts"

export default defineConfig({
    input: "../../openapi/api-docs.json",
    output: {
        path: "src/sdk",
        postProcess: [
            {
                name: "Normalize SDK whitespace",
                command: process.execPath,
                args: [
                    fileURLToPath(new URL("../../scripts/normalize-sdk.mjs", import.meta.url)),
                    "{{path}}",
                ],
            },
        ],
    },
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
        // 后端 OffsetDateTime 序列化带真实时区偏移（本地开发 JVM +08:00，如 "2025-06-01T10:00:00.123+08:00"）；
        // zod v4 的 z.iso.datetime() 默认 offset:false 只接受 Z（UTC），非 UTC 时区下所有 datetime 字段契约校验必挂。
        // 打开 offset 让契约接受 RFC 3339 任意合法偏移（Z 与 ±HH:MM 都行），与后端契约语义对齐。
        { name: "zod", dates: { offset: true } },
        // 表单只取约束数据：common/app 本地保留语义出口与校验提示，不再手抄数值。
        { name: "@hey-api/schemas", type: "form" },
        // 从契约 enum 生成 as const 对象 + 同名 type（如 ProductStatus）：
        // 用 javascript 模式而非 typescript-const，因为项目 tsconfig 开了 erasableSyntaxOnly（TS enum 语法被禁）
        {
            name: "@hey-api/typescript",
            enums: { mode: "javascript" },
        },
    ],
})
