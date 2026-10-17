// status-options —— 状态表 → 页签/下拉选项，中文只在 catalog 写一次。选项由状态表派生，就没有「页签照徽章手抄、抄时顺手改词」的第二份：改表即改页签。表形状吃 Record<K,key> 或 Record<K,{labelKey,...}>；order 给「页签只是状态子集」用。成品句子在渲染边界由 app-kit 的 localizeStatusOptions 换出。

export interface StatusOption<K extends string = string> {
    value: K
    label: string
}

/** 句子还没换出来的选项：与 StatusOption 差别只在 label（成品句子）换成 labelKey（catalog 键）；穷尽性仍由表的 Record<码值,key> 锁死 */
export interface KeyedStatusOption<K extends string = string, LK extends string = string> {
    value: K
    labelKey: LK
}

/** 状态表的一项（键表版）：直接是 catalog key，或「key + 别的展示字段」表里的 labelKey */
type LabelKeyed<LK extends string> = LK | { labelKey: LK }

function labelKeyOf<LK extends string>(entry: LabelKeyed<LK>): LK {
    return typeof entry === "string" ? entry : entry.labelKey
}

/** 状态表（键表）→ 带 labelKey 的选项，不出句子（§4.1）。穷尽性由表的 Record<码值,key> 编译期锁死：加状态漏一格=少一个 labelKey=类型不匹配，而非运行时冒出空白页签 */
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
