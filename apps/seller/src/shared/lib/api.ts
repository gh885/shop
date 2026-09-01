import { redirect } from "@tanstack/react-router"

import { configureSdkClient, createAuthKit, unwrap } from "@shop/api"
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
    type SkuResponse,
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
        unwrap(await AuthApi.logout({ body: { deviceId: getDeviceId() } }))
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
        return unwrap(await AuthApi.me())
    },

    /** 图形验证码（发码前先人机验证） */
    async getCaptcha(): Promise<{ captchaId: string; image: string }> {
        const data = unwrap(await AuthApi.getCaptcha())
        return { captchaId: data.captchaId ?? "", image: data.image ?? "" }
    },

    /** 短信验证码登录 */
    async loginBySms(input: { phone: string; code: string; deviceId: string }) {
        const data = unwrap(await AuthApi.loginBySms({ body: input }))
        return { accessToken: data.accessToken ?? "" }
    },

    /** 密码登录 */
    async loginByPassword(input: { phone: string; password: string; deviceId: string }) {
        const data = unwrap(await AuthApi.loginByPassword({ body: input }))
        return { accessToken: data.accessToken ?? "" }
    },

    /** 发送短信验证码 */
    async sendSmsCode(input: { phone: string; captchaId: string; captchaCode: string }) {
        unwrap(await AuthApi.sendSmsCode({ body: input }))
    },
}

// ---------- 店铺上下文（X-Shop-Id） ----------

/** seller 商品域请求以当前经营店铺为上下文，后端经 X-Shop-Id 头识别 */
const shopHeader = (shopId: string): { "X-Shop-Id": string } => ({ "X-Shop-Id": shopId })

// ---------- 类目属性模板 / 销售属性选择 ----------

/** 一个销售属性维度的选择：attrId 定位模板属性，valueIds 选值域内值，customValues 提交值域外新值 */
export interface SpecSelection {
    attrId: string
    valueIds: string[]
    customValues: string[]
}

export interface CategoryAttrTemplateAttr {
    id: string
    categoryId: string
    name: string
    /** 1 销售属性 / 2 非销售参数 */
    kind: number
    required: boolean
    allowCustom: boolean
    sort: number
    status: number
    createdAt: string
    updatedAt: string
}

export interface CategoryAttrTemplateValue {
    id: string
    attrId: string
    value: string
    sort: number
    /** 1 平台预置 / 2 卖家扩充 */
    source: number
    createdAt: string
}

export interface CategoryAttrTemplateNode {
    attr: CategoryAttrTemplateAttr
    values: CategoryAttrTemplateValue[]
}

// ---------- productApi ----------

export const productApi = {
    /** 店铺商品分页列表（schemas 校验归一，返回 Product 领域形状） */
    async list(
        shopId: string,
        search: { page: number; size: number; status?: number; keyword?: string },
    ) {
        return PageResultSchema(ProductSchema).parse(
            unwrap(
                await ProductsAdminApi.listShopProducts({
                    query: {
                        pageParams: { page: search.page, size: search.size },
                        status: search.status,
                        keyword: search.keyword,
                    },
                    headers: shopHeader(shopId),
                }),
            ),
        )
    },

    /** 商品详情（基本信息 + SKU 列表） */
    async detail(shopId: string, id: string) {
        return ProductDetailSchema.parse(
            unwrap(
                await ProductsAdminApi.getShopProductDetail({
                    path: { id },
                    headers: shopHeader(shopId),
                }),
            ),
        )
    },

    /** 新建草稿商品 */
    async create(shopId: string, payload: CreateProductRequest) {
        return ProductSchema.parse(
            unwrap(
                await ProductsAdminApi.createProduct({
                    body: payload,
                    headers: shopHeader(shopId),
                }),
            ),
        )
    },

    /** 更新基本信息 */
    async updateBasic(shopId: string, id: string, payload: UpdateProductRequest) {
        unwrap(
            await ProductsAdminApi.updateProduct({
                path: { id },
                body: payload,
                headers: shopHeader(shopId),
            }),
        )
    },

    /** 更新销售规格（按新规格对账 SKU） */
    async updateSpecs(shopId: string, id: string, specs: SpecItem[]) {
        unwrap(
            await ProductsAdminApi.updateProductSpecs({
                path: { id },
                body: { specs },
                headers: shopHeader(shopId),
            }),
        )
    },

    /** 更新 SKU 价格库存（schemas 侧 originalPrice 允许 null，映射为 SDK 的 undefined），返回更新后的 SKU 网格 */
    async updateSkus(
        shopId: string,
        id: string,
        items: Array<Omit<SkuUpdateItem, "originalPrice"> & { originalPrice?: number | null }>,
    ): Promise<SkuResponse[]> {
        const data = unwrap(
            await ProductsAdminApi.updateProductSkus({
                path: { id },
                body: {
                    items: items.map((i) => ({
                        ...i,
                        originalPrice: i.originalPrice ?? undefined,
                    })),
                },
                headers: shopHeader(shopId),
            }),
        )
        return data as unknown as SkuResponse[]
    },

    /** 应用销售属性选择 → 服务端按 valueId 组合对账 SKU，返回当前 SKU 网格（价格/库存留空待填） */
    async applySpecs(
        shopId: string,
        id: string,
        selections: SpecSelection[],
    ): Promise<SkuResponse[]> {
        const data = unwrap(
            await ProductsAdminApi.updateProductSpecs({
                path: { id },
                body: { specs: selections } as never,
                headers: shopHeader(shopId),
            }),
        )
        return data as unknown as SkuResponse[]
    },

    /** 发布（草稿 → 上架） */
    async publish(shopId: string, id: string) {
        unwrap(await ProductsAdminApi.publishProduct({ path: { id }, headers: shopHeader(shopId) }))
    },

    /** 下架 */
    async off(shopId: string, id: string) {
        unwrap(await ProductsAdminApi.offProduct({ path: { id }, headers: shopHeader(shopId) }))
    },

    /** 重新上架 */
    async on(shopId: string, id: string) {
        unwrap(await ProductsAdminApi.onProduct({ path: { id }, headers: shopHeader(shopId) }))
    },

    /** 类目树（末级可挂商品） */
    async categoryTree() {
        return CategoryNodeSchema.array().parse(unwrap(await CategoriesApi.getCategoryTree()))
    },

    /** 类目属性模板（公开接口），发布页取销售属性（kind=1）用；带鉴权头避免误判 */
    async attrTemplate(categoryId: string): Promise<CategoryAttrTemplateNode[]> {
        const token = tokenStore.get()
        const res = await fetch(`/api/categories/${categoryId}/attr-template`, {
            headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        })
        if (!res.ok) throw new Error(`拉取类目属性模板失败(${res.status})`)
        return (await res.json()) as CategoryAttrTemplateNode[]
    },
}

// ---------- shopApi ----------

export const shopApi = {
    /** 我的店铺列表 */
    async myShops() {
        return ShopSchema.array().parse(unwrap(await ShopsApi.listMyShops()))
    },

    /** 待确认邀请（我的视角） */
    async myInvites() {
        return ShopInviteItemSchema.array().parse(unwrap(await ShopsApi.listShopInvites()))
    },

    /** 接受加入邀请 */
    async acceptInvite(memberId: string) {
        unwrap(await ShopsApi.acceptShopInvite({ path: { memberId } }))
    },

    /** 开新店（提交 PENDING_REVIEW） */
    async createShop(input: { name: string }) {
        unwrap(await ShopsApi.createShop({ body: { name: input.name } }))
    },

    /** 店铺成员列表（店主视角，含手机号与权限） */
    async members(shopId: string) {
        return ShopMemberItemSchema.array().parse(
            unwrap(await ShopsApi.listShopMembers({ path: { shopId } })),
        )
    },

    /** 邀请成员入店 */
    async invite(shopId: string, input: { phone: string }) {
        unwrap(await ShopsApi.inviteShopMember({ path: { shopId }, body: { phone: input.phone } }))
    },

    /** 移除成员 */
    async removeMember(shopId: string, memberId: string) {
        unwrap(await ShopsApi.removeShopMember({ path: { shopId, memberId } }))
    },
}
