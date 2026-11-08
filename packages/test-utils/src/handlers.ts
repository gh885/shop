import { HttpResponse, http, type RequestHandler } from "msw"

import type {
    AddressParseResult,
    AddressView,
    ApiFieldError,
    ApiProblem,
    NotificationView,
} from "@shop/api/sdk"

// 默认 API handlers —— 按 openapi/api-docs.json 逐端点 mock。path 不带协议头匹配任意 origin；返回值须符合契约 schema（漂移时 SDK 类型层先报错）。这里给「合法但无状态」的兜底，业务断言用 server.use() 局部覆盖。

/** AddressView 假数据（id 须为合法 v4 UUID，否则 SDK zod 校验响应会走契约漂移分支） */
export function makeAddressView(overrides: Partial<AddressView> = {}): AddressView {
    return {
        id: crypto.randomUUID(),
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
function makeAddressParse(overrides: Partial<AddressParseResult> = {}): AddressParseResult {
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

/**
 * 后端统一错误体（RFC 9457 ProblemDetail + 扩展属性）构造器：MSW 桩一律用它、别手拼。手拼最易漏 required 的 status（真实后端由 ProblemDetail.forStatus 保证有），漏了让前端契约校验 zApiProblem 误报 api_contract_drift、把「真漂移」信号淹掉。title/instance 不在这里给：Spring 从状态码/请求 URI 现补。
 */
export function apiProblem(
    status: number,
    fields: {
        detail: string
        code?: string
        params?: Record<string, string | number | boolean>
        errors?: ApiFieldError[]
    },
): ApiProblem {
    return {
        status,
        detail: fields.detail,
        ...(fields.code === undefined ? {} : { code: fields.code }),
        ...(fields.params === undefined ? {} : { params: fields.params }),
        ...(fields.errors === undefined ? {} : { errors: fields.errors }),
        // requestId 永远非空：由 RIdFilter 在每一层注入，没有 requestId 等于这错误没法追
        requestId: crypto.randomUUID(),
    }
}

/** NotificationView 假数据（params 形状随 type 变化，默认给 shipment 的一组；id 须为合法 UUID） */
export function makeNotificationView(overrides: Partial<NotificationView> = {}): NotificationView {
    return {
        id: crypto.randomUUID(),
        type: "shipment_recorded",
        params: { orderGroupId: crypto.randomUUID(), carrierCode: "sf", trackingNo: "SF123456789" },
        link: "/orders/" + crypto.randomUUID(),
        readAt: null,
        createdAt: "2026-11-08T10:00:00Z",
        ...overrides,
    }
}

export const defaultHandlers: RequestHandler[] = [
    http.post("*/addresses/parse", () => HttpResponse.json(makeAddressParse())),

    // 站内信：空列表 + 0 未读是「没有通知」的合法兜底，用例内用 server.use() 覆盖成有数据的
    http.get("*/buyer/notifications", () => HttpResponse.json({ items: [], nextCursor: null })),
    http.get("*/buyer/notifications/unread/count", () => HttpResponse.json(0)),
    http.post("*/buyer/notifications/:id/read", () => new HttpResponse(null, { status: 200 })),
    http.post("*/buyer/notifications/read-all", () => new HttpResponse(null, { status: 200 })),

    // 收货地址：空列表是「没填过地址」的合法兜底，用例内用 server.use() 覆盖成有数据的
    http.get("*/buyer/addresses", () => HttpResponse.json([])),
    http.post("*/buyer/addresses", () => HttpResponse.json(makeAddressView())),
    http.get("*/buyer/addresses/:id", ({ params }) =>
        HttpResponse.json(makeAddressView({ id: String(params.id) })),
    ),
    http.put("*/buyer/addresses/:id", ({ params }) =>
        HttpResponse.json(makeAddressView({ id: String(params.id) })),
    ),
    http.delete("*/buyer/addresses/:id", () => new HttpResponse(null, { status: 204 })),

    // 注销：未申请是最常见的事实；冷静期天数随状态一起下发（前端不写死数字）
    http.get("*/buyer/deletion", () =>
        HttpResponse.json({
            requested: false,
            effectiveAt: "2026-12-31T00:00:00Z",
            coolingOffDays: 7,
        }),
    ),
    http.post("*/buyer/deletion", () => new HttpResponse(null, { status: 200 })),
    http.post("*/buyer/deletion/code", () => new HttpResponse(null, { status: 200 })),
]
