/** 本域业务规则唯一出口（frontend.md「文件名即分层」的 rules 槽位）：判定与不依赖语言的推导。展示词表（含徽章外观）在 constants.ts，wire→视图行在 mapper.ts，表单契约在 form.ts */

export type CouponStatus = "NOT_STARTED" | "ONGOING" | "ENDED" | "STOPPED"

// 口径与后端券评估器一致：停用优先于时间窗；起点闭、终点开；时间脏回退 ONGOING，不擅自宣称已作废
export function deriveCouponStatus(
    templateStatus: string,
    validFrom: string,
    validTo: string,
    now: number,
): CouponStatus {
    if (templateStatus === "STOPPED") return "STOPPED"

    const from = Date.parse(validFrom)
    const to = Date.parse(validTo)
    if (Number.isNaN(from) || Number.isNaN(to)) return "ONGOING"

    if (now < from) return "NOT_STARTED"
    if (now >= to) return "ENDED"
    return "ONGOING"
}
