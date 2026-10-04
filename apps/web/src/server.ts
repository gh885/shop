import handler, { createServerEntry } from "@tanstack/react-start/server-entry"

/** 文档可能含语言偏好和用户状态；静态 assets 仍交给部署层按哈希缓存。 */
export default createServerEntry({
    async fetch(request, options) {
        const response = await handler.fetch(request, options)
        if (!response.headers.get("content-type")?.includes("text/html")) return response
        const headers = new Headers(response.headers)
        const vary = new Map(
            (headers.get("vary") ?? "")
                .split(",")
                .map((value) => value.trim())
                .filter(Boolean)
                .map((value) => [value.toLowerCase(), value]),
        )
        if (!vary.has("*")) {
            vary.set("accept-language", "Accept-Language")
            vary.set("cookie", "Cookie")
            headers.set("Vary", [...vary.values()].join(", "))
        }
        headers.set("Cache-Control", "private, no-store")
        return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers,
        })
    },
})
