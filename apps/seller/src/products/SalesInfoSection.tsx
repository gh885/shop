import { useEffect, useState } from "react"
import { Skeleton } from "@shop/ui-web"
import { toApiError } from "@shop/api"
import type { SkuResponse, SkuUpdateItem } from "@shop/api/sdk"

import { attrTemplate, type CategoryAttrTemplateNode, type SpecSelection } from "./data"

import { FieldRow, SectionCard } from "./SectionCard"
import { SalesAttrsEditor } from "./SalesAttrsEditor"
import { SkuGridEditor } from "./SkuGridEditor"

/**
 * 发布页「销售信息」块：销售属性(选值) + 销售规格(按值组合生成的 SKU 网格)。
 *
 * 模板用类目属性模板接口取并过滤 kind=1 销售属性；选值变化后回调 onApply 生成 SKU 网格
 * （父级负责建草稿 + applySpecs，返回 SkuResponse[]），网格里填的价格/库存/编码再经 onItemsChange 上报，
 * 供发布时一起 updateSkus。
 */
export function SalesInfoSection({
    categoryId,
    onApply,
    onSpecsChange,
    onItemsChange,
}: {
    categoryId: string
    /** 生成 SKU 网格：父级确保草稿存在并调用 applySpecs；返回 SkuResponse[]，空数组/失败抛错 */
    onApply: (selections: SpecSelection[]) => Promise<SkuResponse[]>
    onSpecsChange: (selections: SpecSelection[]) => void
    onItemsChange: (items: SkuUpdateItem[]) => void
}) {
    const [template, setTemplate] = useState<CategoryAttrTemplateNode[] | undefined>()
    const [loadError, setLoadError] = useState<string | undefined>()
    const [selections, setSelections] = useState<SpecSelection[]>([])
    const [skus, setSkus] = useState<SkuResponse[]>([])
    const [applying, setApplying] = useState(false)
    const [applyError, setApplyError] = useState<string | undefined>()

    useEffect(() => {
        let cancelled = false
        attrTemplate(categoryId)
            .then((nodes) => {
                if (!cancelled) setTemplate(nodes.filter((n) => n.attr.kind === "SPEC"))
            })
            .catch((error) => !cancelled && setLoadError(toApiError(error).detail))
        return () => {
            cancelled = true
        }
    }, [categoryId])

    // 选值变化：上报 + 防止抖动后在父级建草稿/applySpecs 生成网格
    // onApply 是父级每次 render 新建的箭头函数（引用不稳定），仅防抖重排不触发多余请求
    // 加入依赖会导致父级建草稿→重渲染→再次 apply 的循环，故整段豁免该规则
    // eslint-disable react-hooks/exhaustive-deps
    useEffect(() => {
        if (selections.length === 0) {
            setSkus([])
            return
        }
        const timer = setTimeout(async () => {
            setApplying(true)
            setApplyError(undefined)
            try {
                const result = await onApply(selections)
                setSkus(result)
            } catch (error) {
                setApplyError(toApiError(error).detail)
                setSkus([])
            } finally {
                setApplying(false)
            }
        }, 400)
        return () => clearTimeout(timer)
    }, [selections])
    // eslint-enable react-hooks/exhaustive-deps

    if (loadError) return <p className="text-sm text-destructive">{loadError}</p>
    if (!template) return <Skeleton className="h-40 w-full" />

    if (template.length === 0) {
        return (
            <p className="text-sm text-muted-foreground">
                该类目没有可配置的销售属性，SKU 保持单规格。
            </p>
        )
    }

    return (
        <SectionCard
            id="section-sales"
            title="销售信息"
        >
            <FieldRow
                label="销售属性"
                hint="规范配置销售属性有助于商品转化"
            >
                <SalesAttrsEditor
                    attrs={template}
                    value={selections}
                    onChange={(s) => {
                        setSelections(s)
                        onSpecsChange(s)
                    }}
                />
            </FieldRow>

            {applyError ? <p className="mt-3 text-sm text-destructive">{applyError}</p> : undefined}
            {applying && <p className="mt-3 text-xs text-muted-foreground">正在按模板生成 SKU…</p>}

            {skus.length > 0 && (
                <FieldRow
                    label="销售规格"
                    required
                >
                    <SkuGridEditor
                        rows={skus}
                        onChange={onItemsChange}
                    />
                </FieldRow>
            )}
        </SectionCard>
    )
}
