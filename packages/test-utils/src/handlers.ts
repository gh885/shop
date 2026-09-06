import { HttpResponse, http, type RequestHandler } from "msw"

import type { AddressParseResponse, AddressResponse } from "@shop/api/sdk"

/**
 * 默认 API handlers —— 按接口契约（openapi/api-docs.json）逐端点 mock。
 *
 * 约定：
 * - handler path 不带协议头 → 匹配任意 origin（SDK client 的 baseUrl 是 http://localhost:8080）；
 * - 返回值必须符合契约 schema，契约漂移时 SDK 类型层先报错；
 * - 这里给的是「合法但无状态」的兜底响应，业务断言用 server.use() 局部覆盖并捕获请求体。
 */

/** AddressResponse 完整假数据（id/label/isDefault 必传，其余可覆盖） */
export function makeAddress(
    overrides: Partial<AddressResponse> & Pick<AddressResponse, "id">,
): AddressResponse {
    return {
        userId: "00000000-0000-4000-8000-000000000001", // 需为合法 v4 UUID（SDK zod schema 校验响应）
        receiverName: "张三",
        phone: "13800000000",
        regionCode: "330106",
        province: "浙江省",
        city: "杭州市",
        district: "西湖区",
        detail: "文一路 1 号",
        label: "HOME",
        isDefault: false,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
        ...overrides,
    }
}

/** AddressParseResponse 假数据（智能粘贴解析结果；regionCode 用 regions.json 真实存在的区划码） */
export function makeAddressParse(
    overrides: Partial<AddressParseResponse> = {},
): AddressParseResponse {
    return {
        receiverName: "张三",
        phone: "13800000000",
        regionCode: "330106",
        province: "浙江省",
        city: "杭州市",
        district: "西湖区",
        detail: "文一路 1 号",
        ...overrides,
    }
}

export const defaultHandlers: RequestHandler[] = [
    http.get("*/user/addresses", () => HttpResponse.json([])),
    http.post("*/user/addresses", () =>
        HttpResponse.json(makeAddress({ id: crypto.randomUUID() })),
    ),
    http.put("*/user/addresses/:id", ({ params }) =>
        HttpResponse.json(makeAddress({ id: String(params.id) })),
    ),
    http.delete("*/user/addresses/:id", () => new HttpResponse(null, { status: 204 })),
    http.put("*/user/addresses/:id/default", () => new HttpResponse(null, { status: 204 })),
    http.delete("*/user/addresses/:id/default", () => new HttpResponse(null, { status: 204 })),
    http.post("*/user/addresses/parse", () => HttpResponse.json(makeAddressParse())),
]
