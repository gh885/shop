/// <reference types="vite/client" />

declare interface ImportMetaEnv {
    /** 构建标识（建议 git sha）：进监控事件信封（与后端信封同名，GEN-48） */
    readonly VITE_APP_VERSION?: string
    /** 真实环境（dev / staging / prod）：进监控事件信封。带错信封的历史日志事后改不回来 */
    readonly VITE_APP_ENV?: string
    /** 前端监控接收路径：留空即默认关（接收端未上线时不发） */
    readonly VITE_RUM_ENDPOINT?: string
}

declare interface ImportMeta {
    readonly env: ImportMetaEnv
}
