/**
 * status-options —— 状态表 → 页签 / 下拉选项，中文只写一次。
 *
 * 状态文案分家成两个词（徽章叫「上架中」、页签叫「在售」）通常不是有人故意要写两遍，
 * 而是页签那份中文是照着徽章那份手抄的——抄的时候顺手改了词，改的时候没人想起来同步。
 * 选项列表由状态表派生，就没有第二份可抄：改表即改页签，漏改无处藏。
 *
 * 两种状态表形状都吃：`Record<K, string>`（纯文案表）与 `Record<K, { label: string, ... }>`
 * （文案与徽章色同表，卖家/管理端那种）。`order` 是给「页签只是状态的一个子集」用的
 * （买家订单页签不设「已取消」这类口径），不传就按表的声明顺序全量出。
 */

/** 一个选项：值给筛选/路由用，文案给人看 */
export interface StatusOption<K extends string = string> {
    value: K
    label: string
}

/** 状态表的一项：纯文案，或「文案 + 别的展示字段」那张表里的 label */
type Labelled = string | { label: string }

function labelOf(entry: Labelled): string {
    return typeof entry === "string" ? entry : entry.label
}

/**
 * 状态表 → 选项数组。
 *
 * 顺序即展示顺序：不传 `order` 时跟着表里键的声明顺序（对象字面量写的是业务顺序，
 * 页签要的就是那个顺序），传 `order` 时按给定子集与次序出。
 */
export function statusOptions<K extends string>(
    labels: Readonly<Record<K, Labelled>>,
    order?: readonly K[],
): StatusOption<K>[] {
    if (order) {
        return order.map((value) => ({ value, label: labelOf(labels[value]) }))
    }
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Object.keys 只会说 string：键就是表里的 K 由参数类型在调用处保证，运行时不可能多出别的键
    const keys = Object.keys(labels) as K[]
    return keys.map((value) => ({ value, label: labelOf(labels[value]) }))
}
