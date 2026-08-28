import { redirect } from "@tanstack/react-router"

import { configureSdkClient, createAuthKit } from "@shop/api"
import {
    CategoryNodeSchema,
    PageResultSchema,
    ProductDetailSchema,
    ProductSchema,
    ShopInviteItemSchema,
    ShopMemberItemSchema,
    ShopSchema,
} from "@shop/api"
import {
    AuthApi,
    CategoriesApi,
    ProductsAdminApi,
    ShopsApi,
    type CreateProductRequest,
    type MeResponse,
    type SpecItem,
    type SkuUpdateItem,
    type UpdateProductRequest,
} from "@shop/api/sdk"

// 浏览器端走 Vite proxy（同源相对路径），见 vite.config.ts
export const authKit = createAuthKit({
    // 引用下方 AuthApi：调用发生在模块初始化后，安全
    refresh: async (deviceId) => {
        const res = await AuthApi.refresh({ body: { deviceId } })
        const token = res.data?.accessToken
        if (!token) throw res.error ?? new Error("refresh 失败")
        return { accessToken: token }
    },
})
export const { tokenStore, authState, bootstrapAuth, getDeviceId, useAuthStatus, useIsLoggedIn } =
    authKit

// 生成 SDK（@shop/api/sdk）默认 client：同源 + 同一套 token / 401 刷新拦截
configureSdkClient("", tokenStore, { debug: import.meta.env.DEV })

// ---------- 登出 ----------

export async function logout(): Promise<void> {
    try {
        const res = await AuthApi.logout({ body: { deviceId: getDeviceId() } })
        if (res.error) throw res.error
    } catch {
        // 登出接口失败也强制清本地状态
    } finally {
        tokenStore.clear()
    }
}

// ---------- 路由守卫 ----------

/** 受保护路由的 beforeLoad 守卫：确保登录态已裁决，未登录跳登录页 */
export async function requireAuth(): Promise<void> {
    await bootstrapAuth()
    if (authState.getStatus() !== "authed") {
        throw redirect({ to: "/login" })
    }
}

// ---------- authApi ----------

export const authApi = {
    /** 当前登录用户信息 */
    async me(): Promise<MeResponse> {
        const res = await AuthApi.me()
        if (res.error) throw res.error
        return res.data ?? {}
    },

    /** 图形验证码（发码前先人机验证） */
    async getCaptcha(): Promise<{ captchaId: string; image: string }> {
        const res = await AuthApi.getCaptcha()
        if (res.error) throw res.error
        return { captchaId: res.data?.captchaId ?? "", image: res.data?.image ?? "" }
    },

    /** 短信验证码登录 */
    async loginBySms(input: { phone: string; code: string; deviceId: string }) {
        const res = await AuthApi.loginBySms({ body: input })
        if (res.error) throw res.error
        return { accessToken: res.data?.accessToken ?? "" }
    },

    /** 密码登录 */
    async loginByPassword(input: { phone: string; password: string; deviceId: string }) {
        const res = await AuthApi.loginByPassword({ body: input })
        if (res.error) throw res.error
        return { accessToken: res.data?.accessToken ?? "" }
    },

    /** 发送短信验证码 */
    async sendSmsCode(input: { phone: string; captchaId: string; captchaCode: string }) {
        const res = await AuthApi.sendSmsCode({ body: input })
        if (res.error) throw res.error
    },
}

// ---------- 店铺上下文（X-Shop-Id） ----------

/** seller 商品域请求以当前经营店铺为上下文，后端经 X-Shop-Id 头识别 */
const shopHeader = (shopId: string): { "X-Shop-Id": string } => ({ "X-Shop-Id": shopId })

// ---------- productApi ----------

export const productApi = {
    /** 店铺商品分页列表（schemas 校验归一，返回 Product 领域形状） */
    async list(
        shopId: string,
        search: { page: number; size: number; status?: number; keyword?: string },
    ) {
        const res = await ProductsAdminApi.listShopProducts({
            query: {
                pageParams: { page: search.page, size: search.size },
                status: search.status,
                keyword: search.keyword,
            },
            headers: shopHeader(shopId),
        })
        if (res.error) throw res.error
        return PageResultSchema(ProductSchema).parse(res.data ?? { records: [], total: 0 })
    },

    /** 商品详情（基本信息 + SKU 列表） */
    async detail(shopId: string, id: string) {
        const res = await ProductsAdminApi.getShopProductDetail({
            path: { id },
            headers: shopHeader(shopId),
        })
        if (res.error) throw res.error
        return ProductDetailSchema.parse(res.data ?? {})
    },

    /** 新建草稿商品 */
    async create(shopId: string, payload: CreateProductRequest) {
        const res = await ProductsAdminApi.createProduct({
            body: payload,
            headers: shopHeader(shopId),
        })
        if (res.error) throw res.error
        return ProductSchema.parse(res.data ?? {})
    },

    /** 更新基本信息 */
    async updateBasic(shopId: string, id: string, payload: UpdateProductRequest) {
        const res = await ProductsAdminApi.updateProduct({
            path: { id },
            body: payload,
            headers: shopHeader(shopId),
        })
        if (res.error) throw res.error
    },

    /** 更新销售规格（按新规格对账 SKU） */
    async updateSpecs(shopId: string, id: string, specs: SpecItem[]) {
        const res = await ProductsAdminApi.updateProductSpecs({
            path: { id },
            body: { specs },
            headers: shopHeader(shopId),
        })
        if (res.error) throw res.error
    },

    /** 更新 SKU 价格库存（schemas 侧 originalPrice 允许 null，映射为 SDK 的 undefined） */
    async updateSkus(
        shopId: string,
        id: string,
        items: Array<Omit<SkuUpdateItem, "originalPrice"> & { originalPrice?: number | null }>,
    ) {
        const res = await ProductsAdminApi.updateProductSkus({
            path: { id },
            body: {
                items: items.map((i) => ({ ...i, originalPrice: i.originalPrice ?? undefined })),
            },
            headers: shopHeader(shopId),
        })
        if (res.error) throw res.error
    },

    /** 发布（草稿 → 上架） */
    async publish(shopId: string, id: string) {
        const res = await ProductsAdminApi.publishProduct({
            path: { id },
            headers: shopHeader(shopId),
        })
        if (res.error) throw res.error
    },

    /** 下架 */
    async off(shopId: string, id: string) {
        const res = await ProductsAdminApi.offProduct({
            path: { id },
            headers: shopHeader(shopId),
        })
        if (res.error) throw res.error
    },

    /** 重新上架 */
    async on(shopId: string, id: string) {
        const res = await ProductsAdminApi.onProduct({
            path: { id },
            headers: shopHeader(shopId),
        })
        if (res.error) throw res.error
    },

    /** 类目树（末级可挂商品） */
    async categoryTree() {
        const res = await CategoriesApi.getCategoryTree()
        if (res.error) throw res.error
        return CategoryNodeSchema.array().parse(res.data ?? [])
    },
}

// ---------- shopApi ----------

export const shopApi = {
    /** 我的店铺列表 */
    async myShops() {
        const res = await ShopsApi.listMyShops()
        if (res.error) throw res.error
        return ShopSchema.array().parse(res.data ?? [])
    },

    /** 待确认邀请（我的视角） */
    async myInvites() {
        const res = await ShopsApi.listShopInvites()
        if (res.error) throw res.error
        return ShopInviteItemSchema.array().parse(res.data ?? [])
    },

    /** 接受加入邀请 */
    async acceptInvite(memberId: string) {
        const res = await ShopsApi.acceptShopInvite({ path: { memberId } })
        if (res.error) throw res.error
    },

    /** 开新店（提交 PENDING_REVIEW） */
    async createShop(input: { name: string }) {
        const res = await ShopsApi.createShop({ body: { name: input.name } })
        if (res.error) throw res.error
    },

    /** 店铺成员列表（店主视角，含手机号与权限） */
    async members(shopId: string) {
        const res = await ShopsApi.listShopMembers({ path: { shopId } })
        if (res.error) throw res.error
        return ShopMemberItemSchema.array().parse(res.data ?? [])
    },

    /** 邀请成员入店 */
    async invite(shopId: string, input: { phone: string }) {
        const res = await ShopsApi.inviteShopMember({
            path: { shopId },
            body: { phone: input.phone },
        })
        if (res.error) throw res.error
    },

    /** 移除成员 */
    async removeMember(shopId: string, memberId: string) {
        const res = await ShopsApi.removeShopMember({ path: { shopId, memberId } })
        if (res.error) throw res.error
    },
}
