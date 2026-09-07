import { toApiError } from "@shop/common"
import { ProductsAdminApi, ProductStatus, type ImageTicketResponse } from "@shop/api/sdk"

// ---------- 商品域数据函数（直接在调用点用，不经集中封装对象） ----------
// seller 端 /seller/** 请求的 X-Shop-Id 店铺上下文头由 SDK client 拦截自动注入
//（见 shared/lib/api.ts 的 contextHeaders），此处不再手动携带。

/** 店铺商品分页列表：wire → 领域形状（非空/字面量状态）。 */
export async function listProducts(search: {
    page: number
    size: number
    status?: ProductStatus
    keyword?: string
}) {
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
    let ticket: ImageTicketResponse | undefined
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
