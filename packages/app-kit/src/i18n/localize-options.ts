import type { KeyedStatusOption, StatusOption } from "@shop/common/domain"

/** 渲染边界把 labelKey 换成句子（源表存 key，穷尽性由类型锁死）；`LK` 把「写错的 key」留在编译期 */
export function localizeStatusOptions<K extends string, LK extends string>(
    options: readonly KeyedStatusOption<K, LK>[],
    t: (key: LK) => string,
): StatusOption<K>[] {
    return options.map((option) => ({ value: option.value, label: t(option.labelKey) }))
}
