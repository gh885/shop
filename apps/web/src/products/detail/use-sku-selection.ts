import { useEffect, useRef } from "react"

import type { ProductDetail, SkuSelection } from "../product"
import { findMatchingSku, isValueAvailable } from "../product"
import { sameSelection, sanitizeSelection, toggleSelection } from "./search"

export function useSkuSelection({
    detail,
    spec,
    onSpecChange,
}: {
    detail: ProductDetail
    spec: SkuSelection
    onSpecChange: (next: SkuSelection, options: { replace: boolean }) => void
}) {
    const skus = detail.skus
    const selection = sanitizeSelection(detail, spec)
    const matchedSku = findMatchingSku(skus, selection)

    const repaired = useRef<SkuSelection | undefined>(undefined)
    useEffect(() => {
        if (sameSelection(spec, selection)) return
        if (repaired.current !== undefined && sameSelection(repaired.current, spec)) return
        repaired.current = spec
        // oxlint-disable-next-line react-doctor/no-pass-data-to-parent -- URL 自愈修正必须走 effect（渲染期写 URL 是副作用）；ref 去重保证同一脏 spec 只修一次
        onSpecChange(selection, { replace: true })
    }, [spec, selection, onSpecChange])

    function select(specName: string, value: string) {
        onSpecChange(toggleSelection(selection, specName, value), { replace: false })
    }

    function isAvailable(specName: string, value: string) {
        return isValueAvailable(skus, selection, specName, value)
    }

    return { selection, select, matchedSku, isAvailable }
}
