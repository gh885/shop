import { useState } from "react"

import type { ProductDetail, SkuSelection } from "../product"

import { findMatchingSku, isValueAvailable } from "../product"

/**
 * 规格选择状态容器：route 持有唯一实例，gallery（图随 SKU 切换）与
 * purchase-panel（选择器/价格/CTA）共享同一份派生结果。
 * 派生值不手动 memo——React Compiler 自动缓存，回调身份由编译器稳定。
 */
export function useSkuSelection(detail: ProductDetail | undefined) {
    const [selection, setSelection] = useState<SkuSelection>({})

    const skus = detail?.skus ?? []

    /** 点选某维度的值：再点一次同值取消（回退到未选该维度） */
    function select(specName: string, value: string) {
        setSelection((prev) => {
            const next = { ...prev }
            if (next[specName] === value) delete next[specName]
            else next[specName] = value
            return next
        })
    }

    const matchedSku = detail ? findMatchingSku(skus, selection) : undefined

    /** 值是否可选（考虑当前其他维度的已选约束），供选择器置灰 */
    function isAvailable(specName: string, value: string) {
        return isValueAvailable(skus, selection, specName, value)
    }

    return { selection, select, matchedSku, isAvailable }
}
