/// <reference types="vite/client" />

declare interface ImportMetaEnv {
    /** 后端地址：SSR loader 的绝对地址（生产必须显式配）；浏览器端走同源相对路径不用它 */
    readonly VITE_BACKEND_URL?: string
    /** 卖家中心地址：独立 SPA，生产为环境差异项 */
    readonly VITE_SELLER_URL?: string
    /** 图片 CDN 域名：图片字段存的是对象存储 key，展示时用 imgUrl(key) 拼此域名 */
    readonly VITE_IMAGE_BASE_URL?: string
}

declare interface ImportMeta {
    readonly env: ImportMetaEnv
}
