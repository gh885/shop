import { toApiError } from "@shop/api"
import {
    CategoriesApi,
    ProductsAdminApi,
    type CategoryAttrNodeResponse,
    type ProductResponse,
    type SkuResponse,
    type SkuUpdateItem,
} from "@shop/api/sdk"

// ---------- 商品域数据函数（直接在调用点用，不经集中封装对象） ----------
// seller 端 /seller/** 请求的 X-Shop-Id 店铺上下文头由 SDK client 拦截自动注入
//（见 shared/lib/api.ts 的 contextHeaders），此处不再手动携带。

/** 店铺商品分页列表：wire → 领域形状（非空/字面量状态）。 */
export async function listProducts(search: {
    page: number
    size: number
    status?: ProductResponse["status"]
    keyword?: string
}): Promise<{ records: ProductResponse[]; total: number }> {
    const page = await ProductsAdminApi.listShopProducts({
        query: {
            pageParams: { page: search.page, size: search.size },
            status: search.status,
            keyword: search.keyword,
        },
    })
    return {
        records: page.records,
        total: page.total,
    }
}

/** 更新 SKU 价格库存，返回更新后的 SKU 网格 */
export async function updateProductSkus(
    id: string,
    items: SkuUpdateItem[],
): Promise<SkuResponse[]> {
    return await ProductsAdminApi.updateProductSkus({
        path: { id },
        body: { items },
    })
}

/** 应用销售属性选择 → 服务端按 valueId 组合对账 SKU，返回当前 SKU 网格（价格/库存留空待填） */
export async function applyProductSpecs(
    id: string,
    selections: SpecSelection[],
): Promise<SkuResponse[]> {
    const data = await ProductsAdminApi.updateProductSpecs({
        path: { id },
        body: { specs: selections } as never,
    })
    return data as unknown as SkuResponse[]
}

/** 发布（草稿 → target 态）。默认立即上架（PUBLISHED）；放入仓库传 target="WAREHOUSE"。 */
export async function publishProduct(id: string, target?: "PUBLISHED" | "WAREHOUSE") {
    await ProductsAdminApi.publishProduct({
        path: { id },
        query: target ? { target } : undefined,
    })
}

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
    let ticket
    try {
        // issueImageTicket 走 /seller/**（Vite proxy），ShopMembershipFilter 强制店铺上下文——
        // X-Shop-Id 已由 SDK client 拦截注入。若后端未带七牛配置/凭证失败，detail 会揭示（如「文件存储未配置」）。
        ticket = await ProductsAdminApi.issueImageTicket({ query: { ext } })
    } catch (error) {
        //  抛 ApiError 对象（无 message），ImageUpload 读 err.message 会落兜底文案，
        // 这里把 detail 提出来，否则真实原因被吞。
        const detail = toApiError(error).detail // ApiError 无 message（Java 异常 detail），透出让前端可见
        throw new Error(
            detail ? `获取上传凭证失败：${detail}` : "获取上传凭证失败，请确认已配置文件存储",
            { cause: error },
        )
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
    // 返回相对 key：展示时由 imgUrl(key) 拼当前域名（见 #/shared/lib/image）
    return ticket.key
}

/** 类目属性模板（公开接口），发布页取销售属性（kind=SPEC）用 */
export async function attrTemplate(categoryId: string): Promise<CategoryAttrTemplateNode[]> {
    return await CategoriesApi.getPublicCategoryAttrTemplate({ path: { id: categoryId } })
}

// ---------- 商品域类型（就近放在数据函数旁） ----------

/** 类目属性模板：与生成契约同构，直接别名（勿手写镜像字段，契约演进会漂移） */
export type CategoryAttrTemplateNode = CategoryAttrNodeResponse

/** 一个销售属性维度的选择：attrId 定位模板属性，valueIds 选值域内值，customValues 提交值域外新值 */
export interface SpecSelection {
    attrId: string
    valueIds: string[]
    customValues: string[]
    /** 模板取值（valueId）→ 取值图 */
    valueImages?: Record<string, string>
    /** 自定义取值文本 → 取值图 */
    customValueImages?: Record<string, string>
}
