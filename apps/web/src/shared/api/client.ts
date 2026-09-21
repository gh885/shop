import { BACKEND_URL } from "#/shared/lib/env"
import { configureSdkClient, createAuthKit } from "@shop/common"
import { AuthApi } from "@shop/api/sdk"

// 浏览器端走 Vite proxy（同源相对路径）
// 本文件只做「依赖装配」，不对外暴露认证成员（tokenStore/bootstrapAuth/hooks 等）——
// 认证逻辑统一从 #/shared/api/auth 出，避免同一概念两个入口。
export const authKit = createAuthKit({
    // 引用下方 AuthApi：调用发生在模块初始化后，安全
    // SDK 出错即 throw（responseStyle: data + throwOnError），失败由 createAuthKit 裁决为 guest
    refresh: async (deviceId) => {
        const res = await AuthApi.refresh({ body: { deviceId } })
        if (!res.accessToken) throw new Error("refresh 失败")
        return { accessToken: res.accessToken }
    },
})

const { tokenStore } = authKit

// 生成 SDK（@shop/api/sdk）的默认 client：同源 + 同一套 token/401 刷新拦截。
// 之后业务代码可直接调用 CartApi.getCartItems() 等具名方法。
// 浏览器端走 Vite proxy（同源相对路径）；SSR loader 在 Node 跑需要绝对地址，用 VITE_BACKEND_URL（生产必须显式配）
const baseUrl = import.meta.env.SSR ? BACKEND_URL : ""
configureSdkClient(baseUrl, tokenStore, { debug: import.meta.env.DEV })
