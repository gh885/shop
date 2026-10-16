import { message } from "#/locales/message"
import { queryOptions, skipToken, useMutation, useQuery } from "@tanstack/react-query"

import type {
    CategoryAttrNodeResponse,
    ProductStatus,
    SkuUpdateItem,
    UploadTicket,
} from "@shop/api/sdk"
import { CategoriesApi, ProductsAdminApi } from "@shop/api/sdk"

import { toApiError, type ApiError } from "@shop/common/contract"
import type { ToastText } from "@shop/app-kit/data"
import type { SellerMessageKey, SellerParamsByKey } from "#/locales/messages.gen"

import { flattenLeafPaths, type LeafPath } from "#/product/category"

// 抛的是结构（sceneKey + ApiError）不抛句子：拼后端 detail 进 message 会在英文界面印出一句中文
export class UploadTicketFailure extends Error {
    readonly sceneKey: Exclude<SellerMessageKey, keyof SellerParamsByKey>
    readonly apiError: ApiError

    constructor(sceneKey: Exclude<SellerMessageKey, keyof SellerParamsByKey>, apiError: ApiError) {
        super(sceneKey)
        this.sceneKey = sceneKey
        this.apiError = apiError
    }
}

// 这两类也只递场景 key(+数据)，句子由调用点按 locale 出（同 UploadTicketFailure）
export class UploadTicketInvalidError extends Error {
    constructor() {
        super("common.upload.ticketInvalid")
    }
}
// 浏览器直传对象存储被拒：服务商原始 detail 是外部数据，不作 UI 文案透出
export class UploadDirectFailureError extends Error {
    readonly status: number
    constructor(status: number) {
        super(`common.upload.directFailed(${status})`)
        this.status = status
    }
}

// 卖家商品列表的全部排序，与后端 listShopProducts 的 sort 枚举一一对应
export const PRODUCT_SORTS = [
    "createdAt_desc",
    "createdAt_asc",
    "stock_asc",
    "stock_desc",
    "soldCount_asc",
    "soldCount_desc",
] as const

export type ProductSort = (typeof PRODUCT_SORTS)[number]

// seller 端 /seller/** 的 X-Shop-Id 店铺上下文头由 SDK client 拦截自动注入，此处不再手动携带

// 七牛 Kodo 直传只收 POST multipart（token+file），用 PUT 会撞「only allow POST method」405（实测）
// 返回相对 key 非完整 URL：入库存 key，展示经 imgUrl(key) 拼域名（换域名不坏历史数据）
export async function uploadProductImage(file: File): Promise<string> {
    const ext = (file.name.split(".").pop() ?? "").toLowerCase().replaceAll(/[^a-z0-9]/g, "")
    let ticket: UploadTicket | undefined
    try {
        ticket = await ProductsAdminApi.issueImageTicket({ query: { ext } })
    } catch (error) {
        throw new UploadTicketFailure("common.upload.ticketFailed", toApiError(error))
    }
    if (!ticket.uploadUrl || !ticket.token || !ticket.url || !ticket.key)
        throw new UploadTicketInvalidError()

    const form = new FormData()
    form.append("token", ticket.token)
    // 表单必须带 key：scope 绑定的 key 要与 uploadUrl 里的目标一致，只传 token+file 会 403「key doesn't match with scope」
    if (ticket.key) form.append("key", ticket.key)
    form.append("file", file)
    const res = await fetch(ticket.uploadUrl, {
        method: "POST",
        body: form,
    })
    if (!res.ok) {
        throw new UploadDirectFailureError(res.status)
    }
    return ticket.key
}

export interface ProductListSearch {
    status?: ProductStatus
    keyword?: string
    sort?: ProductSort
    page: number
    size: number
}

export const productKeys = {
    all: ["products"] as const,
    lists: (shopId: string) => ["products", shopId] as const,
    list: (shopId: string, s: ProductListSearch) =>
        [
            "products",
            shopId,
            s.status ?? "all",
            s.keyword ?? "",
            s.sort ?? "createdAt_desc",
            s.page,
            s.size,
        ] as const,
    detail: (id: string) => ["products", "detail", id] as const,
}

const categoryKeys = {
    tree: ["categories", "tree"] as const,
    specTemplate: (categoryId?: string) => ["categories", "spec-template", categoryId] as const,
}

// shopId 入 key：切店铺不串缓存；带 placeholderData 不能走 suspense，失败冒到路由错误页由全局默认接管
export const productListOptions = (shopId: string, s: ProductListSearch) =>
    queryOptions({
        queryKey: productKeys.list(shopId, s),
        // 透传 signal：筛选/排序/翻页换 key 后，旧请求不该留在后端跑完
        queryFn: ({ signal }) =>
            ProductsAdminApi.listShopProducts({
                query: {
                    pageParams: { page: s.page, size: s.size },
                    status: s.status,
                    keyword: s.keyword,
                    sort: s.sort,
                },
                signal,
            }),
        placeholderData: (prev) => prev,
    })

// 低频公共数据，全量拉一次长缓存；不设 throwOnError → 失败抛给路由级边界。外围读取走 useLeafPaths 单独退出
export const categoryTreeOptions = queryOptions({
    queryKey: categoryKeys.tree,
    queryFn: () => CategoriesApi.getCategoryTree(),
    staleTime: 10 * 60_000,
})

// throwOnError:false：消费方（类目名回填/BasicStep）头上无边界，树取不到就退化成不显示，不能炸掉已填的草稿
export function useLeafPaths(): LeafPath[] {
    const { data } = useQuery({ ...categoryTreeOptions, throwOnError: false })
    return flattenLeafPaths(data ?? [])
}

// 列表编辑弹窗 / 发布页回填共用一份详情缓存：无 productId 用 skipToken 不发请求，失败抛边界
// 带 skipToken 与 suspense 互斥 → 要 suspense 的消费方用下面的 productDetailSuspenseOptions（同 key）
// 不在共享 options 里设 throwOnError:false：两端边界诉求相反，写死会让其中一端静默失效（发布页回填失败必须渲染错误页，不能放行成可编辑空表单）
export const productDetailOptions = (productId: string | undefined) =>
    queryOptions({
        queryKey: productKeys.detail(productId ?? ""),
        queryFn: productId
            ? () => ProductsAdminApi.getShopProductDetail({ path: { id: productId } })
            : skipToken,
        retry: false,
    })

// 同一份 queryKey（缓存/失效共用），去 skipToken：useSuspenseQuery 不接受 enabled/skipToken，「没 id 不发请求」改由父组件控制挂载
export const productDetailSuspenseOptions = (productId: string) =>
    queryOptions({
        queryKey: productKeys.detail(productId),
        queryFn: () => ProductsAdminApi.getShopProductDetail({ path: { id: productId } }),
        retry: false,
    })

/** 编辑 SKU 后只失效当前商品详情；列表刷新与关闭弹窗由 onSaved 通知消费方。 */
export function useUpdateProductSkus(success: ToastText, onSaved: () => void) {
    return useMutation({
        mutationFn: ({ productId, items }: { productId: string; items: SkuUpdateItem[] }) =>
            ProductsAdminApi.updateProductSkus({ path: { id: productId }, body: { items } }),
        meta: { success, error: message("product.toast.saveFailed") },
        // 详情 key 含 productId（由变量算出），静态 meta 装不下 → 走库自己的 onSuccess
        onSuccess: (_data, { productId }, _ctx, { client }) => {
            void client.invalidateQueries({ queryKey: productKeys.detail(productId) })
            onSaved()
        },
    })
}

// throwOnError:false：消费方就地渲染错误态用官方 refetch 重试，失败不抛边界
export const categorySpecTemplateOptions = (categoryId: string | undefined) =>
    queryOptions({
        queryKey: categoryKeys.specTemplate(categoryId),
        queryFn: categoryId
            ? async (): Promise<CategoryAttrNodeResponse[]> => {
                  const nodes = await CategoriesApi.getPublicCategoryAttrTemplate({
                      path: { id: categoryId },
                  })
                  return nodes.filter((n) => n.attr.kind === "SPEC")
              }
            : skipToken,
        staleTime: 10 * 60_000,
        throwOnError: false,
    })
