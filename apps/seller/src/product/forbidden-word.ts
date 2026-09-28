import { ErrorCodes, toApiError, type ApiError } from "@shop/common"

/**
 * 违禁词错误（COM-01）的前端消费：**不自己判词，只把后端的裁决定位到字段**。
 *
 * 为什么不把词表拉到前端做本地校验：词表是运营在后台增删的数据（compliance 模块的表），
 * 前端抄一份就会与后端漂移——运营下线了某个词，前端还在拦一个已经合法的标题。
 * 唯一判据在后端（`ForbiddenWordCommand`），前端只负责把 400 `FORBIDDEN_WORD_HIT` 说清楚：
 * 命中的字段 + 后端 detail 里已经带上的那个词。
 *
 * 这个解析是**纯函数**（输入错误对象、输出字段名与提示语），所以「detail 的措辞变了」
 * 在 typecheck 与单测里立刻暴露，而不是等发布后才发现提示串了。
 */

/** 命中的是哪个字段 → 表单字段名（与 `ProductBasicForm` 的键同名） */
export type ForbiddenField = "name" | "subtitle"

/** 一条命中：定位到表单字段 + 该字段的提示语 */
export type ForbiddenHit = { field: ForbiddenField; message: string }

const FIELD_LABELS: Record<ForbiddenField, string> = {
    name: "商品标题",
    subtitle: "商品卖点",
}

/**
 * 后端 detail 的形状（由 `ForbiddenWordService.assertClean` 拼出）：
 * 「「标题」包含违禁词「最佳」（分类：广告法用语），请修改后重新提交」——
 * 字段落在句首的书名号里，命中词跟在「包含违禁词」后面。两处各自锚定，不靠「第几个书名号」的位置，
 * 措辞一改就双双认不出、退化成全局提示，而不是把命中词报错成字段名。
 */
const FIELD_AT_HEAD = /^「([^」]+)」/
const HIT_WORD = /包含违禁词「([^」]+)」/

/** 句首那个字段标签 → 表单字段名；认不出就不猜字段 */
const FIELD_BY_LABEL: Record<string, ForbiddenField> = {
    标题: "name",
    卖点: "subtitle",
}

/**
 * 解析违禁词错误：不是这个码就返回 undefined（调用方按普通错误处理）。
 *
 * @returns 字段 + 该字段的提示语；命中但认不出字段时返回 null（只给全局提示，不硬猜字段）
 */
export function parseForbiddenWordError(error: unknown): ForbiddenHit | null | undefined {
    const apiError: ApiError = toApiError(error)
    if (apiError.code !== ErrorCodes.FORBIDDEN_WORD_HIT) {
        return undefined
    }
    // detail 由后端拼装（含 ForbiddenWordService.categoryLabel 的中文分类），文案改了这里会失配——
    // 失配的后果是退化成「只给全局提示」，不会误报到别的字段上
    const field = FIELD_BY_LABEL[FIELD_AT_HEAD.exec(apiError.detail)?.[1] ?? ""]
    if (!field) return null
    const word = HIT_WORD.exec(apiError.detail)?.[1]
    return {
        field,
        message: word ? `${FIELD_LABELS[field]}包含违禁词「${word}」，请修改` : apiError.detail,
    }
}
