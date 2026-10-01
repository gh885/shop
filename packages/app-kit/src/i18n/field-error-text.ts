import { type ApiFieldError, isValidationRule, type ValidationRule } from "@shop/common/contract"
import { type AppLocale } from "@shop/common/i18n"
import { translateAppKit } from "./messages"

/**
 * 422 字段级明细 → **当前语言**的那句提示（docs/error-codes.md 的 422 参数通道）。
 *
 * <p>为什么不是直接显示 `error.message`：那是后端注解上那句成品中文。显示它等于在英文界面上印中文
 * （与 `errorTextPlan` 挡住的那件事同一类），所以 422 这一族也走「后端出结构、前端出句子」：
 * 后端给 `rule`（+ `min` / `max`），句子住 catalog（`validation.<RULE>`，两份语言各一条）。
 *
 * <p>三种结局，按可信度降级：
 *
 * 1. **认得 rule 且边界齐** → catalog 那句，参数填上（「最长 {max} 个字」）。
 * 2. **认得 rule 但边界缺**（后端没给 `min` / `max`）→ `undefined`，与「不认识 rule」同处理。
 *    **不为它另写一套无参句**：catalog 里那几条句子永远带槽位，`formatMessage` 缺参数时会把模板
 *    原样返回（也就是把 `{max}` 印出去），要出一句不带数字的「内容太长」就得为每个规则再养一条词表，
 *    而这条分支是**防御性的**——后端 `FieldValidationErrors` 只在读不到注解时才可能缺边界，
 *    正常路径上 rule 与边界同生共死。真发生了（收到不带边界的 MAX_LENGTH）由调用方降级，
 *    并且那条响应本身就是该被上报的契约破口。
 * 3. **不认识 rule**（词表外的约束，或后端加了新规则而这里还没跟上）→ `undefined`，
 *    调用方自己降级（表单退回后端那句中文）。**不在这里猜一句**——猜错的话用户会看到一句
 *    与约束无关的话，而那比不显示更难排查。
 *
 * <p>它不认识 `errors[].value`（COM-01 违禁词那条通道的值）：那是**业务数据**、不是规则，
 * 要显示它的是业务场景自己（卖家端把命中的词嵌进 `product.publish.forbiddenWordHit`）。
 */

/** 这条明细的 rule；词表外（或 400 那条通道来的、没有 rule）时是 undefined */
export function validationRuleOf(error: ApiFieldError): ValidationRule | undefined {
    return isValidationRule(error.rule) ? error.rule : undefined
}

/**
 * 取 422 那一格的用户可见句子。
 *
 * <p>逐个规则**写字面量 key** 而不是拿变量去索引：那样 `translateAppKit` 的第三个形参类型会退化成
 * 「所有 key 的参数并集」，于是「给 `REQUIRED` 传 `{min}`」这种拼错也编得过。写死则每个 key 的槽位
 * 由 codegen 产出的 `ParamsOf` 各自把着（`MAX_LENGTH` 少传 `max` 直接编译不过）。
 *
 * @param error 一条 `errors[]` 明细（后端给 `field` / `message` / 可选 `rule` / `min` / `max`）
 * @param locale 界面语言（必填且排第二，与同层 `translateAppKit` 一个形状）
 * @returns 认得 rule 时是那句本地化文案；不认识 rule 时是 undefined（调用方按自己的规矩降级）
 */
export function fieldErrorText(error: ApiFieldError, locale: AppLocale): string | undefined {
    switch (validationRuleOf(error)) {
        case "REQUIRED":
            return translateAppKit("validation.REQUIRED", locale)
        case "PATTERN":
            return translateAppKit("validation.PATTERN", locale)
        // 带边界的四条：边界缺了就不给句子（见头注释第 2 条）。不用「传 0 兜底」那种写法——
        // 那会让「上限真的是 0」与「后端没给」同形，而前者是要显示的
        case "MIN_LENGTH":
            return error.min === undefined
                ? undefined
                : translateAppKit("validation.MIN_LENGTH", locale, { min: error.min })
        case "MAX_LENGTH":
            return error.max === undefined
                ? undefined
                : translateAppKit("validation.MAX_LENGTH", locale, { max: error.max })
        case "MIN":
            return error.min === undefined
                ? undefined
                : translateAppKit("validation.MIN", locale, { min: error.min })
        case "MAX":
            return error.max === undefined
                ? undefined
                : translateAppKit("validation.MAX", locale, { max: error.max })
        default:
            return undefined
    }
}
