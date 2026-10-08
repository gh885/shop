import handler, { createServerEntry } from "@tanstack/react-start/server-entry"
import { localizePathname, parseLocalePath, resolveHttpLocale } from "./shared/lib/locale-url"

function isPageRequest(request: Request, pathname: string): boolean {
    return (
        ["GET", "HEAD"].includes(request.method) &&
        !/^\/(?:_|assets\/)/.test(pathname) &&
        !/\.[a-z0-9]+$/i.test(pathname)
    )
}

function localeRedirect(request: Request): Response | undefined {
    const url = new URL(request.url)
    if (!isPageRequest(request, url.pathname)) return undefined
    const parsed = parseLocalePath(url.pathname)
    if (parsed.invalid) return undefined
    const localized = localizePathname(url.pathname, resolveHttpLocale(request))
    if (localized === url.pathname) return undefined
    return new Response(undefined, {
        status: parsed.locale ? 308 : 307,
        headers: {
            Location: localized + url.search,
            "Cache-Control": "private, no-store",
            Vary: "Cookie, Accept-Language",
        },
    })
}

function privateDocument(response: Response): Response {
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
}

async function finishResponse(
    response: Response,
    redirect: Response | undefined,
): Promise<Response> {
    if (!response.headers.get("content-type")?.includes("text/html")) return response
    if (redirect && response.ok) {
        await response.body?.cancel()
        return redirect
    }
    return privateDocument(response)
}

export default createServerEntry({
    async fetch(request, options) {
        const redirect = localeRedirect(request)
        if (redirect && request.headers.get("accept")?.includes("text/html")) return redirect
        return finishResponse(await handler.fetch(request, options), redirect)
    },
})
