/**
 * status-options —— 状态表 → 页签 / 下拉选项，中文只在 catalog 写一次。
 *
 * 状态文案分家成两个词（徽章叫「上架中」、页签叫「在售」）通常不是有人故意要写两遍，
 * 而是页签那份是照着徽章那份手抄的——抄的时候顺手改了词，改的时候没人想起来同步。
 * 选项列表由状态表派生，就没有第二份可抄：改表即改页签，漏改无处藏。
 *
 * 表形状吃 `Record<K, key>`（纯键表）与 `Record<K, { labelKey, ... }>`（键与徽章色同表那种）。
 * `order` 是给「页签只是状态的一个子集」用的（买家订单页签不设「已取消」这类口径），
 * 不传就按表的声明顺序全量出。成品句子在渲染边界由 app-kit 的 `localizeStatusOptions` 换出来。
 */

/** 一个选项：值给筛选/路由用，文案给人看 */
export interface StatusOption<K extends string = string> {
    value: K
    label: string
}

/**
 * 「句子还没换出来」的选项：值给筛选/路由，`labelKey` 交给渲染边界。
 * 与 {@link StatusOption} 的差别只在 `label`（成品句子）换成 `labelKey`（catalog 键）——
 * 状态表把中文换成键之后走它，穷尽性仍由表的 `Record<码值, key>` 锁死。
 */
export interface KeyedStatusOption<K extends string = string, LK extends string = string> {
    value: K
    labelKey: LK
}

/** 状态表的一项（键表版）：直接是 catalog key，或「key + 别的展示字段」那张表里的 labelKey */
type LabelKeyed<LK extends string> = LK | { labelKey: LK }

function labelKeyOf<LK extends string>(entry: LabelKeyed<LK>): LK {
    return typeof entry === "string" ? entry : entry.labelKey
}

/**
 * 状态表（键表）→ 带 `labelKey` 的选项，不出句子。
 *
 * 吃 `Record<K, MessageKey>` 或 `Record<K, { labelKey, ... }>`（键与别的展示字段同表时只取键）。
 * §4.1：common 不承载用户可见文案，穷尽性由表的 `Record<码值, key>` 在编译期锁死——
 * 加状态漏一格 = 少一个 `labelKey` = 类型不匹配，而不是运行时冒出一个空白页签。
 */
export function statusOptionsFromKeys<K extends string, LK extends string>(
    entries: Readonly<Record<K, LabelKeyed<LK>>>,
    order?: readonly K[],
): KeyedStatusOption<K, LK>[] {
    const pick = (value: K): KeyedStatusOption<K, LK> => ({
        value,
        labelKey: labelKeyOf(entries[value]),
    })
    if (order) {
        return order.map(pick)
    }
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Object.keys 只会说 string：键就是参数表里的 K，由参数类型在调用处保证，运行时不会多出别的
    return (Object.keys(entries) as K[]).map(pick)
}
