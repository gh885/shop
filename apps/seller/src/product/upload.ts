import type { UploadTicket } from "@shop/api/sdk"
import { ProductsAdminApi } from "@shop/api/sdk"

import { toApiError, type ApiError } from "@shop/common/contract"
import type { SellerMessageKey, SellerParamsByKey } from "#/locales/messages.gen"

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
