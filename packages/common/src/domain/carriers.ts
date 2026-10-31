/**
 * carriers —— 承运商 code → 展示名。与后端 `Carriers.java` 的九家白名单同源：后端管码的归一化与
 * 白名单裁决，前端只拿它做展示翻译；新增承运商两边同步加（后端是裁决入口，漏加会在发货时被拒，
 * 前端漏加只会退回展示 code，不会出错）。
 */
export const CARRIER_LABELS: Readonly<Record<string, string>> = {
    sf: "顺丰速运",
    ems: "中国邮政EMS",
    zto: "中通快递",
    yto: "圆通速递",
    sto: "申通快递",
    yunda: "韵达快递",
    jt: "极兔速递",
    jd: "京东物流",
    deppon: "德邦快递",
}

/** 未知 code 原样展示：白名单外的码进不了发货入口，这里兜一层只是展示健壮性 */
export function carrierLabel(code: string): string {
    return CARRIER_LABELS[code] ?? code
}
