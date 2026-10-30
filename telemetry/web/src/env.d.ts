/// <reference types="vite/client" />

/**
 * 平台前端自己的 env 声明。刻意不 extends `@shop/config`：多一条依赖就多一条搬家时要剥的线。
 */
declare interface ImportMetaEnv {
    readonly VITE_TELEMETRY_API_BASE?: string
}

declare interface ImportMeta {
    readonly env: ImportMetaEnv
}
