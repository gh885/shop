import { MediaControllerApi } from "@shop/api/sdk"

/**
 * 浏览器直传对象存储，返回存库用的 key（不是完整 URL；展示走 `imgUrl(key)`）。
 *
 * <p>七牛 Kodo 直传只收 POST multipart（token + key + file），PUT 会 405。
 * `key` 必须和凭证 scope 一致，只传 token + file 会 403。
 */
export async function uploadImage(file: File): Promise<string> {
    const ext = (file.name.split(".").pop() ?? "").toLowerCase().replaceAll(/[^a-z0-9]/g, "")
    const ticket = await MediaControllerApi.issueImageTicket({ query: { ext } })
    if (!ticket.uploadUrl || !ticket.token || !ticket.key) {
        throw new Error("UPLOAD_TICKET_INVALID")
    }

    const form = new FormData()
    form.append("token", ticket.token)
    form.append("key", ticket.key)
    form.append("file", file)
    const response = await fetch(ticket.uploadUrl, { method: "POST", body: form })
    if (!response.ok) {
        throw new Error(`UPLOAD_FAILED_${response.status}`)
    }
    return ticket.key
}
