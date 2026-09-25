import { BACKEND_URL } from "#/shared/lib/env"
import { configureSdkClient, createSdkAuthKit } from "@shop/common"

// 浏览器端走 Vite proxy（同源相对路径）
// 本文件只做「依赖装配」，不对外暴露认证成员（tokenStore/bootstrapAuth/hooks 等）——
// 认证逻辑统一从 #/shared/api/auth 出，避免同一概念两个入口。
export const authKit = createSdkAuthKit()

const { tokenStore } = authKit

// 生成 SDK（@shop/api/sdk）的默认 client：同源 + 同一套 token/401 刷新拦截。
// 之后业务代码可直接调用 CartApi.getCartItems() 等具名方法。
// 浏览器端走 Vite proxy（同源相对路径）；SSR loader 在 Node 跑需要绝对地址，用 VITE_BACKEND_URL（生产必须显式配）
const baseUrl = import.meta.env.SSR ? BACKEND_URL : ""
configureSdkClient(baseUrl, tokenStore, { debug: import.meta.env.DEV })
