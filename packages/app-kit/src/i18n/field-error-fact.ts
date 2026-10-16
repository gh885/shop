import { type ApiFieldError, isValidationRule, type ValidationRule } from "@shop/common/contract"
import type { MessageParams } from "@shop/i18n"
import type { AppKitMessageKey, AppKitParamsOf } from "../locales/messages.gen"

/** 422 字段明细→可本地化事实 `{ message: key, params }`，句子在渲染边界按当前语言换（与本地 Zod 链路同形）；三种结局按可信度降级，详见 docs/error-codes.md 422 参数通道 */

/** 一条可本地化的字段错误；形状与 Zod issue `{ message, params }` 逐字相同，同一渲染落点认两种来源 */
export interface FieldErrorFact {
    message: AppKitMessageKey
    params?: MessageParams
}

/** 这条明细的 rule；词表外（或 400 那条通道来的、没有 rule）时是 undefined */
export function validationRuleOf(error: ApiFieldError): ValidationRule | undefined {
    return isValidationRule(error.rule) ? error.rule : undefined
}

/** 取 422 明细的可本地化事实；逐个规则写字面量 key，`AppKitParamsOf` 把每个 key 的槽位编进类型 */
export function fieldErrorFact(error: ApiFieldError): FieldErrorFact | undefined {
    switch (validationRuleOf(error)) {
        case "REQUIRED":
            return { message: "validation.REQUIRED" }
        case "PATTERN":
            return { message: "validation.PATTERN" }
        // 带边界的四条：边界缺了就不给事实（见头注释第 2 条）。不用「传 0 兜底」那种写法——
        // 那会让「上限真的是 0」与「后端没给」同形，而前者是要显示的
        case "MIN_LENGTH":
            return error.min === undefined
                ? undefined
                : withParams("validation.MIN_LENGTH", { min: error.min })
        case "MAX_LENGTH":
            return error.max === undefined
                ? undefined
                : withParams("validation.MAX_LENGTH", { max: error.max })
        case "MIN":
            return error.min === undefined
                ? undefined
                : withParams("validation.MIN", { min: error.min })
        case "MAX":
            return error.max === undefined
                ? undefined
                : withParams("validation.MAX", { max: error.max })
        default:
            return undefined
    }
}

/** 让 `params` 的类型跟 key 联动：给 `MAX_LENGTH` 传 `{ minimum }` 编译不过 */
function withParams<K extends AppKitMessageKey>(key: K, params: AppKitParamsOf<K>): FieldErrorFact {
    return { message: key, params }
}
