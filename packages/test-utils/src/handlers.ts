import { HttpResponse, http, type RequestHandler } from "msw"

import type {
    AddressParseResult,
    AddressResponse,
    SellerTicketItem,
    TicketResponse,
} from "@shop/api/sdk"

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

/** AddressParseResult 假数据（智能粘贴解析结果；regionCode 用 regions.json 真实存在的区划码） */
export function makeAddressParse(overrides: Partial<AddressParseResult> = {}): AddressParseResult {
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

/** TicketResponse 完整假数据（售后单：整单售后的默认口径 = 实付 199 元，进行中） */
export function makeTicket(
    overrides: Partial<TicketResponse> & Pick<TicketResponse, "id">,
): TicketResponse {
    return {
        orderId: "00000000-0000-4000-8000-000000000002", // 需为合法 v4 UUID（SDK zod schema 校验响应）
        type: "REFUND_ONLY",
        status: "APPLYING",
        // 默认口径与 status 一致：APPLYING 的买家动作只有撤销（C5b，契约必填）
        availableActions: ["CANCEL"],
        reasonCode: "QUALITY_ISSUE",
        // 无理由强制（AFS-45）默认不成立：要测「卖家只剩同意」的用例自己覆盖这两项
        noReasonEnforced: false,
        reason: "尺码不合适",
        refundAmount: { amount: 19900, currency: "CNY" },
        returnLogisticsCompany: null,
        returnTrackingNo: null,
        refundedAt: null,
        createdAt: "2026-01-02T00:00:00Z",
        updatedAt: "2026-01-02T00:00:00Z",
        ...overrides,
    }
}

/** SellerTicketItem 完整假数据（卖家售后工作台一行：售后单 + 订单摘要） */
export function makeSellerTicketItem(overrides: Partial<SellerTicketItem> = {}): SellerTicketItem {
    return {
        id: "00000000-0000-4000-8000-000000000010",
        orderId: "00000000-0000-4000-8000-000000000002",
        orderNo: "20260102120000001",
        receiverName: "张三",
        itemCount: 1,
        firstItemName: "测试SKU",
        type: "REFUND_ONLY",
        status: "APPLYING",
        // 默认口径与 status 一致：APPLYING 的卖家动作是同意/拒绝（C5b，契约必填）
        availableActions: ["AGREE", "REJECT"],
        reasonCode: "QUALITY_ISSUE",
        noReasonEnforced: false,
        reason: "尺码不合适",
        refundAmount: { amount: 19900, currency: "CNY" },
        returnLogisticsCompany: null,
        returnTrackingNo: null,
        refundedAt: null,
        createdAt: "2026-01-02T00:00:00Z",
        updatedAt: "2026-01-02T00:00:00Z",
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

    // 售后：GET 默认 404 = 「这单从没申请过售后」，这是最常见的事实而不是错误（前端据此把售后卡整块不画）
    http.get("*/orders/:id/after-sales", () => new HttpResponse(null, { status: 404 })),
    http.post("*/orders/:id/after-sales", () =>
        HttpResponse.json(makeTicket({ id: crypto.randomUUID() }), { status: 201 }),
    ),
    http.put("*/orders/:id/after-sales/cancel", () => new HttpResponse(null, { status: 204 })),
    http.put("*/orders/:id/after-sales/return", () => new HttpResponse(null, { status: 204 })),

    // 卖家售后工作台：空列表是合法兜底（用例内用 server.use 覆盖成有数据的）
    http.get("*/seller/after-sales", () => HttpResponse.json({ records: [], total: 0 })),
]
