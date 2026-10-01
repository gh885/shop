import { z } from "zod"

import { ClientFailureCodes } from "./client-failure"

/**
 * 字段级明细的一格（后端 `GlobalExceptionHandler` 挂在 ProblemDetail 的扩展属性 `errors` 上），
 * 以及 400 里那条参数通道（COM-01 违禁词，`BusinessException.badRequest` 的第三参）。
 *
 * <p><b>wire 形状的唯一来源是 OpenAPI 契约</b>：后端 `infra/web/OpenApiConfig` 把 `ApiFieldError`
 * 声明进 `components.schemas`，生成物是 `@shop/api` 的 `zApiFieldError`。这一份是**前端归一化后**
 * 的形状，只剩两个用处：`toApiError` 兜底解读非 HTTP 来源的错误，以及契约校验没过时的宽松降级
 * （见 `sdk-client.ts` 的 `apiErrorFromResponse`）。它不再是与后端各说一遍的那份副本。
 */
export const ApiFieldErrorSchema = z.object({
    /** 机器的字段名（DTO / 表单的键），嵌套与数组用 `items[0].quantity` 这样的属性路径——不是中文标签 */
    field: z.string(),
    /** 后端注解上那句成品中文。日志与「拿不到 rule 时的中文兜底」靠它，不是给用户看的那句 */
    message: z.string(),
    /**
     * 那条规则实际作用到的**数据**（命中的违禁词、越界的那个数字）。
     * 有它才能把句子参数化：前端 catalog 写 `包含违禁词「{word}」`，不用再从中文 detail 里正则捞。
     */
    value: z.string().optional(),
    /**
     * 违反了哪条规则（422 校验族，`ValidationRules` 的取值）：前端据此出自己的语言句子，
     * 不用显示 `message` 那句中文。词表外的约束后端只给 `message`、不带这一格。
     */
    rule: z.string().optional(),
    /** 规则的边界（`MAX_LENGTH` 带 `max`、`MIN_LENGTH` 带 `min`）：一律 JSON 数字，后端常量改了这边跟着变 */
    min: z.number().optional(),
    max: z.number().optional(),
})
export type ApiFieldError = z.infer<typeof ApiFieldErrorSchema>

/**
 * 那条错误的**结构化上下文**：把「必须原样给用户、且只有后端知道」的值从句子里拆出来当数据出。
 * 首个使用者是两条地址上限码（`ADDRESS_LIMIT_EXCEEDED` / `MERCHANT_ADDRESS_LIMIT_EXCEEDED`）：
 * 上限 20 / 200 住在后端常量里，前端没有对边，写进 catalog 就是一个会谎报的字面量。
 *
 * 与 `errors` 的分工：`errors` 定位**字段**（前端按 field 标红输入框），`params` 定位**这一条错误的原因**
 * （没有对应输入框可标红，例如「最多保存 {limit} 条收货地址」）。一句话两者都需要时各走各的。
 *
 * 值只收标量三态：catalog 句子的 `{slot}` 是字符串插值，数字与布尔原样传；对象 / 数组一律丢——
 * 它们顺着上报与序列化会变成第四种形状，且没有哪句 catalog 句子能插一个对象。
 * 与 `errors` 同样由契约声明（`ApiProblem.params`，值的类型是三态标量）；
 * 这一份只是前端归一化后的那一份，wire 形状的权威在 `openapi/api-docs.json`。
 */
export const ApiParamsSchema = z.record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
export type ApiParams = z.infer<typeof ApiParamsSchema>

/**
 * 前端统一处理的错误形状（**不是** wire 形状——wire 形状是契约里的 `ApiProblem`）。
 * 归一化时每一格都是**白名单重建**，没列到的扩展属性不进 ApiError。
 *
 * <p>刻意没有 `title`：那是 RFC 9457 的英文 reason phrase（"Unauthorized" / "Not Found"），
 * 对用户没有用——面向用户的句子由前端 catalog 或状态码那条通道出。此前它在 schema 里声明着，
 * 而 `apiErrorFromResponse` / `toApiError` 从来没填过它，调用方按它分支永远拿到 undefined，
 * 正是本仓反复点名的「schema 说有、运行时永远没有」。要按状态码分流就直接用 `status`。
 */
export const ApiErrorSchema = z.object({
    status: z.number(),
    detail: z.string(),
    code: z.string().optional(),
    requestId: z.string().optional(),
    errors: z.array(ApiFieldErrorSchema).optional(),
    params: ApiParamsSchema.optional(),
})
export type ApiError = z.infer<typeof ApiErrorSchema>

/**
 * 响应契约校验失败（生成 SDK 的 zod responseValidator 抛出）。
 * 这是前端独有的错误来源：HTTP 本身成功，但 payload 不符合 OpenAPI 契约（后端契约漂移）。
 *
 * 它是**客户端本地失败**（`client-failure.ts`），不是后端发出来的码——所以住那份词表，
 * 不出现在 `ErrorCodes` 里（此前它是那份服务端词表里唯一一个前端独有的例外）。
 */
export const RESPONSE_VALIDATION_FAILED = ClientFailureCodes.RESPONSE_VALIDATION_FAILED

export function isZodError(err: unknown): err is z.ZodError {
    return err instanceof z.ZodError
}

/**
 * 这是不是一次**已经面向用户说过了**的失败（后端错误 / 网络失败）——即错误体形状的那一类。
 *
 * <p>判据就是 {@link toApiError} 一直用的那一条：对象 + 带字符串 `detail`。SDK 的错误拦截器把
 * 后端 ProblemDetail 与网络失败（`status: 0`）都归一成了这个形状，所以「这条错误用户已经看见过了」
 * 与「这条是这个形状」是同一件事。
 *
 * <p>它用来分两类错误：这一类**静默吞掉**没问题（提示已经由全局写操作反馈发出去了），另一类
 * （`TypeError` 之类，是代码坏了）**不能静默**——那正是 `submitForm` 上报监控的那一类。
 * 一个判据两处用，所以出口在这里，`toApiError` 与 `submit-form` 都调它，不各写一遍形状。
 */
export function isApiError(err: unknown): err is ApiError {
    return (
        typeof err === "object" && err !== null && "detail" in err && typeof err.detail === "string"
    )
}

/** 把 ZodError 的 issues 压成一行可读文本（打日志/上报用） */
export function zodIssuesText(err: z.ZodError): string {
    return err.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ")
}

/**
 * 从错误体里取字段级明细：只收「field 与 message 都是字符串」的条目，其余丢掉，留下的也只按
 * 声明的那三格重建（后端多给一格不进 ApiError，免得它顺着上报与序列化漏成第四种形状）。
 *
 * 丢而不是留着，是因为下游拿它把输入框标红：一条 `field` 是数字、或 `message` 缺失的脏记录，
 * 表现是标到一个不存在的字段上、句子没有谓语——后端形状变了要在这里红，不能漏到界面上。
 * 空数组当没有：`errors: []` 与「没有字段级信息」对调用方是同一件事。
 */
export function fieldErrorsOf(err: object): ApiFieldError[] | undefined {
    const raw = (err as { errors?: unknown }).errors
    if (!Array.isArray(raw)) return undefined
    const clean: ApiFieldError[] = []
    for (const item of raw) {
        const one = fieldErrorOf(item)
        if (one !== undefined) clean.push(one)
    }
    return clean.length > 0 ? clean : undefined
}

/**
 * 一条明细的白名单重建：只收 `field` / `message` 与那几个标量槽位，其余一律不进来。
 *
 * <p>拆出来不只是为了短：它把「什么算一条合法明细」收成一处，四个标量槽位逐个判类型——
 * 声明之外的键不收（ApiError 会进上报，漏进去的键等于给监控一个没人声明的形状），
 * 类型不符的丢掉而不让整格消失（后端多写一个字段不该让已知的字段错误消失）。
 */
function fieldErrorOf(item: unknown): ApiFieldError | undefined {
    if (typeof item !== "object" || item === null) return undefined
    const { field, message, value, rule, min, max } = item as Record<string, unknown>
    if (typeof field !== "string" || typeof message !== "string") return undefined
    return {
        field,
        message,
        ...(typeof value === "string" ? { value } : {}),
        ...(typeof rule === "string" ? { rule } : {}),
        ...(typeof min === "number" ? { min } : {}),
        ...(typeof max === "number" ? { max } : {}),
    }
}

/**
 * 从错误体里取结构化上下文：只保留标量值的条目，其余丢弃（理由同 `fieldErrorsOf`）。
 *
 * 空对象当没有：`params: {}` 与「这条错误没有上下文」对调用方是同一件事，
 * 否则调用方要写 `params?.limit` 之外还得判一次空。
 */
export function paramsOf(err: object): ApiParams | undefined {
    const raw = (err as { params?: unknown }).params
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return undefined
    const clean: ApiParams = {}
    for (const [key, value] of Object.entries(raw)) {
        if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
            clean[key] = value
        }
    }
    return Object.keys(clean).length > 0 ? clean : undefined
}

function fromZodError(status: number): ApiError {
    return {
        status,
        detail: "响应数据不符合接口契约",
        code: RESPONSE_VALIDATION_FAILED,
    }
}

/**
 * 任意抛出的错误 → 归一化 ApiError。
 * 生成 SDK 已通过错误拦截器把错误归一化为 { status, detail, code?, requestId?, errors?, params? }，
 * 这里兜底把其它异常（网络层、zod 契约校验等）也拢成同一形状，供调用方用 code/status 分支处理。
 */
export function toApiError(err: unknown): ApiError {
    if (isZodError(err)) return fromZodError(200)
    if (isApiError(err)) {
        return {
            status: "status" in err && typeof err.status === "number" ? err.status : 0,
            detail: err.detail,
            code: "code" in err && typeof err.code === "string" ? err.code : undefined,
            requestId:
                "requestId" in err && typeof err.requestId === "string" ? err.requestId : undefined,
            errors: fieldErrorsOf(err),
            params: paramsOf(err),
        }
    }
    return { status: 0, detail: "请求失败，请稍后重试" }
}
