import { queryOptions, skipToken, useMutation, useQuery } from "@tanstack/react-query"

import type {
    CategoryAttrNodeResponse,
    ProductStatus,
    SkuUpdateItem,
    UploadTicket,
} from "@shop/api/sdk"
import { CategoriesApi, ProductsAdminApi } from "@shop/api/sdk"

import { toApiError, type ApiError } from "@shop/common/contract"
import type { SellerMessageKey, SellerParamsByKey } from "#/locales/messages.gen"

import { flattenLeafPaths, type LeafPath } from "#/product/category"

/**
 * 取上传凭证失败：抛出的是**结构**（场景 key + 归一后的 ApiError），不是一句话。
 *
 * 把后端 detail 拼进 message 等于在 `errorText` 之外开第二条取文案的路（§7.3：detail 只有中文界面
 * 才当文案），英文界面就会印出一句中文。句子由调用点按 locale 定稿——那块皮肤（ImageUpload）只读
 * `error.message`，所以调用点在递给它之前压成一句。
 */
export class UploadTicketFailure extends Error {
    readonly sceneKey: Exclude<SellerMessageKey, keyof SellerParamsByKey>
    readonly apiError: ApiError

    constructor(sceneKey: Exclude<SellerMessageKey, keyof SellerParamsByKey>, apiError: ApiError) {
        // message 故意放 key 而不是句子：真漏到界面上是一串可 grep 的键名，比悄悄印一句中文好发现
        super(sceneKey)
        this.sceneKey = sceneKey
        this.apiError = apiError
    }
}

// 商品列表排序契约
/** 卖家商品列表支持的全部排序方式（与后端 listShopProducts 的 sort 枚举一一对应） */
export const PRODUCT_SORTS = [
    "createdAt_desc",
    "createdAt_asc",
    "stock_asc",
    "stock_desc",
    "soldCount_asc",
    "soldCount_desc",
] as const

export type ProductSort = (typeof PRODUCT_SORTS)[number]

// SDK 调用封装（数据函数）// seller 端 /seller/** 请求的 X-Shop-Id 店铺上下文头由 SDK client 拦截自动注入，
// 此处不再手动携带。

/**
 * 商品图上传：取七牛直传凭证 → 浏览器直传（不经过应用服务器）→ 返回**对象存储 key（相对路径）**供入库。
 *
 * 七牛 Kodo 直传契约是 {@code POST multipart/form-data}（字段 token + file；key 已编码进 token），
 * 不是浏览器 PUT。用 PUT 会撞上「only allow POST method」405（实测）。
 *
 * 返回 key 而非完整 URL：产品 images / mainImage / 取值图一律**存 key**，展示时经 imgUrl(key) 拼域名——
 * 换域名只改 VITE_IMAGE_BASE_URL，历史/新数据都可拼；避免存完整 URL 后换域名/协议就不可访问。
 */
export async function uploadProductImage(file: File): Promise<string> {
    const ext = (file.name.split(".").pop() ?? "").toLowerCase().replaceAll(/[^a-z0-9]/g, "")
    let ticket: UploadTicket | undefined
    try {
        // issueImageTicket 走 /seller/**（Vite proxy），ShopMembershipFilter 强制店铺上下文——
        // X-Shop-Id 已由 SDK client 拦截注入。若后端未带七牛配置/凭证失败，detail 会揭示（如「文件存储未配置」）。
        ticket = await ProductsAdminApi.issueImageTicket({ query: { ext } })
    } catch (error) {
        // SDK 抛的 ApiError 没有 message，皮肤（ImageUpload）读的是 `error.message`：
        // 这里不代它造句，只把场景与那一发错误原样递上去，句子由调用点的 errorText 定稿
        throw new UploadTicketFailure("common.upload.ticketFailed", toApiError(error))
    }
    if (!ticket.uploadUrl || !ticket.token || !ticket.url || !ticket.key)
        throw new Error("图片上传凭证缺失")

    const form = new FormData()
    form.append("token", ticket.token)
    // 七牛要求表单里带 key：凭证 scope 绑定的 key 与上传目标（uploadUrl 里的 key）必须一致，
    // 只传 token+file 会 403「key doesn't match with scope」〔实测〕。
    if (ticket.key) form.append("key", ticket.key)
    form.append("file", file)
    const res = await fetch(ticket.uploadUrl, {
        method: "POST",
        body: form,
    })
    if (!res.ok) {
        const detail = await res.text().catch(() => "")
        throw new Error(`图片直传七牛失败（${res.status}）${detail}`)
    }
    // 返回相对 key：展示时由 imgUrl(key) 拼当前域名
    return ticket.key
}

/**
 * products 域的 TanStack Query 定义层：只放**声明式、无状态**的 query 定义与 key 工厂。
 *
 * - 所有 queryKey 集中在此（前缀结构一眼可见，invalidate 不会漏 key）；
 * - 有状态的编排 hooks（useProductDraft / useProductList 这类视图模型）留在页面旁，
 *   内部消费本文件的 options，不放进来。
 */

// queryKey 工厂
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

// query 定义
/** 店铺商品分页列表（shopId 入 key：切店铺不串缓存）。
 *  带 placeholderData（不能走 suspense），失败冒到路由错误页由全局默认接管。 */
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

/** 类目树：低频变更公共数据，全量拉一次长缓存，页面内搜索/级联都在这份树上算。
 *  消费方是发布向导第一步（选类目），失败走全局默认抛给该步外层的路由级 QueryBoundary：
 *  整块换成错误 UI + 官方 reset 重试，比静默降级成空树（看不见也点不动）诚实。
 *  外围读取（BasicStep 的回填/语料）走 useLeafPaths，单独退出。 */
export const categoryTreeOptions = queryOptions({
    queryKey: categoryKeys.tree,
    queryFn: () => CategoriesApi.getCategoryTree(),
    staleTime: 10 * 60_000,
})

/** 末级路径清单（搜索语料）：树没变编译器自动缓存，不重复展平。
 *  调用点显式 `throwOnError: false`：消费方（发布第二步的类目名回填、BasicStep）头上
 *  没有边界可接，树取不到就退化成不显示，不能把已填的草稿一起炸掉。 */
export function useLeafPaths(): LeafPath[] {
    const { data } = useQuery({ ...categoryTreeOptions, throwOnError: false })
    return flattenLeafPaths(data ?? [])
}

// 商品详情（列表页编辑弹窗 / 发布页回填共用一份缓存）
/**
 * 店铺商品详情：跳过了就整个不发请求（skipToken），不是「发了再丢掉」。
 *
 * 抽取自两处本地加载（列表页 EditSkuDialog 的 effect、发布页 useProductDraft 的回填 effect）——
 * 同一份服务端数据被两个消费者各自 `useState` 拉一遍，是「两份拷贝 + 各自失效」的形态：
 * 弹窗改完 SKU 后发布页看不到、发布页保存后弹窗里还是旧价格，且两处各写一套 loading/error。
 *
 * 不设 staleTime 覆盖（吃全局 10s 兜底）：这是弹窗与回填的取数口，
 * 写操作后由调用方 invalidate 或 setQueryData 收敛。
 *
 * 不设 `throwOnError: false`：两个消费方的错误边界诉求**相反**，写在共享 options 里会让其中
 * 一端静默失效（frontend.md「错误与重试」第 2 条），所以默认走全局的「失败抛给边界」：
 * - 列表页 `EditSkuDialog`：弹窗内的区块（`QueryBoundary`）→ 首次失败就地错误态 + 官方 reset 重试，
 *   已有详情后的后台刷新失败不抛（`throwWhenNoData`），正在编辑的表单不会因此卸载；
 * - 发布页 `useProductDraft`：回填是**该页主体数据**，头上有路由 errorComponent → 失败渲染路由错误页，
 *   绝不放行成「可编辑的空表单」（那是数据丢失路径）。
 *
 * 本选项带 skipToken（`enabled` 由调用方间接控制），**与 suspense 互斥**；要 suspense 的消费方
 * 用下面的 {@link productDetailSuspenseOptions}（同key、无 skipToken）。
 */
/** 商品详情（发布页回填 / 编辑弹窗）：无 productId 时不发请求。失败抛给边界。 */
export const productDetailOptions = (productId: string | undefined) =>
    queryOptions({
        queryKey: productKeys.detail(productId ?? ""),
        queryFn: productId
            ? () => ProductsAdminApi.getShopProductDetail({ path: { id: productId } })
            : skipToken,
        retry: false,
    })

/**
 * 商品详情的 suspense 变体：**同一份 queryKey**（缓存与失效完全共用），只是去掉了 skipToken。
 *
 * 为什么要单独一个：上面那个用 skipToken 表达「没有 id 就不发请求」，而 `useSuspenseQuery`
 * 不接受 enabled / skipToken（frontend.md 规则 3：这类开关与 suspense 互斥）。所以 suspense
 * 消费方改用「**由父组件控制挂载**」来表达同一个条件——没有 id 就不渲染子组件，自然不发请求，
 * 也就不会有「挂着一个永远挂起的组件」。
 */
export const productDetailSuspenseOptions = (productId: string) =>
    queryOptions({
        queryKey: productKeys.detail(productId),
        queryFn: () => ProductsAdminApi.getShopProductDetail({ path: { id: productId } }),
        retry: false,
    })

/** 编辑 SKU 后只失效当前商品详情；列表刷新与关闭弹窗由 onSaved 通知消费方。 */
export function useUpdateProductSkus(success: string, onSaved: () => void) {
    return useMutation({
        mutationFn: ({ productId, items }: { productId: string; items: SkuUpdateItem[] }) =>
            ProductsAdminApi.updateProductSkus({ path: { id: productId }, body: { items } }),
        meta: { success, error: "保存失败" },
        // 详情 key 含 productId（由变量算出），静态 meta 装不下 → 走库自己的 onSuccess
        onSuccess: (_data, { productId }, _ctx, { client }) => {
            void client.invalidateQueries({ queryKey: productKeys.detail(productId) })
            onSaved()
        },
    })
}

// 类目销售属性模板（发布页两处共用）
/**
 * 类目「销售属性」模板（kind === SPEC）：与类目树同为低频变更公共数据，长缓存。
 * 发布页两处消费（草稿 hook 本地算 SKU 组合、销售信息区渲染编辑器）直接 useQuery(本 options)。
 * 失败**不抛**（`throwOnError: false`），由消费方就地渲染错误态并用官方的 `refetch()` 重试
 * —— 官方错误处理示例的写法。
 */
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
