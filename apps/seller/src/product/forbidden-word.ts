import { ErrorCodes, toApiError, type ApiError } from "@shop/common/contract" /**
 * 违禁词错误（COM-01）的前端消费：**不自己判词，只把后端的裁决定位到字段**。
 *
 * 为什么不把词表拉到前端做本地校验：词表是运营在后台增删的数据（compliance 模块的表），
 * 前端抄一份就会与后端漂移——运营下线了某个词，前端还在拦一个已经合法的标题。
 * 唯一判据在后端（`ForbiddenWordCommand`），前端只负责把 400 `FORBIDDEN_WORD_HIT` 说清楚：
 * 命中的字段 + 命中的那个词。
 *
 * 两者都从 `errors` 那一格取（`field` 是机器字段名、`value` 是命中的词），不再从中文 `detail` 里正则捞：
 * 捞出来的那份是措辞依赖（后端改一个字这里就静默失配），且英文界面根本没法用一句中文去捞。
 * 参数通道见 docs/error-codes.md 的 COM-01 与 i18n.md。
 *
 * 本模块只做**结构解析**（命中哪个字段、命中哪个词），不出句子：那句话的唯一出口是 catalog +
 * `errorText`。在这里拼一句中文，等于又开一条取文案的路——还会在英文界面印出来。
 */

/** 命中的是哪个字段 → 表单字段名（与 `ProductBasicForm` 的键同名） */
export type ForbiddenField = "name" | "subtitle"

/** 解析结果：字段 + 命中的那个词。词是运营词表里的数据，不翻译；后端没给 value 时为 undefined */
export type ForbiddenWordFound = { field: ForbiddenField; word?: string }

/** 一条命中：定位到表单字段 + 该字段已按 locale 定稿的提示语（调用方用 catalog 组好后传进来） */
export type ForbiddenHit = { field: ForbiddenField; message: string }

/** 后端报的字段是不是这张表单认识的键；别的模块（评价、售后）命中的字段在这里会被挡掉 */
const isForbiddenField = (field: string): field is ForbiddenField =>
    field === "name" || field === "subtitle"

/**
 * 解析违禁词错误：不是这个码就返回 undefined（调用方按普通错误处理）。
 *
 * @returns 字段 + 命中词；命中但报的字段不属于这张表单时返回 null（只给全局提示，不硬猜字段）
 */
export function parseForbiddenWordError(error: unknown): ForbiddenWordFound | null | undefined {
    const apiError: ApiError = toApiError(error)
    if (apiError.code !== ErrorCodes.FORBIDDEN_WORD_HIT) {
        return undefined
    }
    // 逐条判而不是 find(谓词)：find 不会把元素类型收窄成 { field: ForbiddenField }，
    // 拿回来的 field 还是 string，正是要防的那种「什么都认不出」的宽
    for (const item of apiError.errors ?? []) {
        if (isForbiddenField(item.field)) return { field: item.field, word: item.value }
    }
    return null
}
