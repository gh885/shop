/// <reference types="vite/client" />

declare interface ImportMetaEnv {
    readonly VITE_APP_VERSION?: string
    readonly VITE_APP_ENV?: string
    readonly VITE_RUM_ENDPOINT?: string
}

declare interface ImportMeta {
    readonly env: ImportMetaEnv
}
