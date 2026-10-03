import type { KeyedStatusOption, StatusOption } from "@shop/common/domain"

/**
 * 把「带 labelKey 的选项」在渲染边界换成「带句子的选项」。
 *
 * 与 `translateSidebarItems` 是同一套分工：源表存 catalog key、句子只在用时由本端 `t` 换出来。
 * 于是状态表本地化后仍是 `Record<码值, key>`（穷尽性由表的类型锁死，§i18n.md），而下游的
 * `StatusFilter` / 页签 / 徽章拿到的是它们一直期待的 `{value, label}`，那几个组件本身不用改。
 *
 * `LK` 从选项的 key 位与调用侧的 `t` 一起推出：源表声明成别的 key 集合（或传一个宽到 `string`
 * 的 `t`）在这里过不去——正是这条把「写错的 key」留在编译期。
 */
export function localizeStatusOptions<K extends string, LK extends string>(
    options: readonly KeyedStatusOption<K, LK>[],
    t: (key: LK) => string,
): StatusOption<K>[] {
    return options.map((option) => ({ value: option.value, label: t(option.labelKey) }))
}
