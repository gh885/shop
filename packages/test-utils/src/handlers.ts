import { HttpResponse, http, type RequestHandler } from "msw"

import type { AddressParseResult, ApiFieldError, ApiProblem } from "@shop/api/sdk"

// 默认 API handlers —— 按 openapi/api-docs.json 逐端点 mock。path 不带协议头匹配任意 origin；返回值须符合契约 schema（漂移时 SDK 类型层先报错）。这里给「合法但无状态」的兜底，业务断言用 server.use() 局部覆盖。

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

export const defaultHandlers: RequestHandler[] = [
    http.post("*/addresses/parse", () => HttpResponse.json(makeAddressParse())),
]
