/**
 * 掩码形状的唯一前端出口（GEN-51 的前端半边）。
 *
 * 与后端 `PhoneNumber.mask()` 同为「前 3 + 掩码段 + 后 4」，但两处的**兜底刻意相反**，
 * 不是漏改：后端拿不到合法号码时返回整串掩码（日志里宁可不显示也不漏一位），前端原样返回
 * （物流页的联系电话可能是 95543 这类短号，掩成「95***」就是伪造了一个号）。
 */

/** 掩码段：「这是不是掩码」的判断也用它。ui-web 那份零依赖副本由 shared-vocabulary 门禁钉同值 */
export const MASK_SEGMENT = "****"

/** 手机号脱敏：13800138000 → 138****8000（不足 7 位原样返回，不伪造掩码） */
export function maskPhone(phone: string): string {
    return phone.length >= 7 ? `${phone.slice(0, 3)}${MASK_SEGMENT}${phone.slice(-4)}` : phone
}
