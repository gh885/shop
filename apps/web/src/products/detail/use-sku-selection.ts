import { useEffect, useRef } from "react"

import type { ProductDetail, SkuSelection } from "../product"
import { findMatchingSku, isValueAvailable } from "../product"
import { sameSelection, sanitizeSelection, toggleSelection } from "./sku-search"

/**
 * 规格选择状态容器：选中态存在 URL（`?spec=`），本 hook 只负责读 → 收窄 → 派生 → 上报变更意图。
 *
 * 唯一实例由 route 持有，gallery（主图随 SKU 切换）与 purchase-panel（选择器/价格/CTA）
 * 共享同一份派生结果。派生值不手动 memo —— React Compiler 自动缓存，回调身份由编译器稳定。
 *
 * ## push / replace 的分工（谁写 URL 谁负责，不散在组件里）
 * - `select(...)` 是**用户动作** → route 以 `push` 落历史，后退能撤回一次选择
 * - 自愈修正是**系统动作** → route 以 `replace` 落地，不进历史
 *   （否则后退会回到脏 URL、再被修一次，后退键变成「修 URL」键）
 */
export function useSkuSelection({
    detail,
    spec,
    onSpecChange,
}: {
    detail: ProductDetail
    /** URL 里的规格选择（已过 `validateSearch`），本 hook 唯一的选中态来源 */
    spec: SkuSelection
    /** 上报变更意图；`options.replace` 为 true 表示这是自愈修正而非用户动作 */
    onSpecChange: (next: SkuSelection, options: { replace: boolean }) => void
}) {
    const skus = detail.skus
    const selection = sanitizeSelection(detail, spec)
    const matchedSku = findMatchingSku(skus, selection)

    /**
     * 脏 URL 自愈：收窄结果与 URL 不一致 → 用 replace 把残留的维度/值抹掉。
     *
     * 为什么不会和用户点击打架：`select` 写入的 spec 一定来自收窄后的选择，本身合法，
     * 所以本效应只对**从外部带进来的** URL（老链接、改规格前的分享链接）触发。
     * 用 ref 记住已修过的原始 spec —— 导航落地前的重渲染里，同一份脏 spec 只修一次。
     */
    const repaired = useRef<SkuSelection | undefined>(undefined)
    useEffect(() => {
        if (sameSelection(spec, selection)) return
        if (repaired.current !== undefined && sameSelection(repaired.current, spec)) return
        repaired.current = spec
        // oxlint-disable-next-line react-doctor/no-pass-data-to-parent -- URL 自愈修正必须走 effect（渲染期写 URL 是副作用）；ref 去重保证同一脏 spec 只修一次
        onSpecChange(selection, { replace: true })
    }, [spec, selection, onSpecChange])

    /** 点选某维度的值：同值再点一次取消该维度 */
    function select(specName: string, value: string) {
        onSpecChange(toggleSelection(selection, specName, value), { replace: false })
    }

    /** 值是否可选（考虑当前其他维度的已选约束），供选择器置灰 */
    function isAvailable(specName: string, value: string) {
        return isValueAvailable(skus, selection, specName, value)
    }

    return { selection, select, matchedSku, isAvailable }
}
