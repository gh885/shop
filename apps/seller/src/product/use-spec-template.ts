import { useEffect, useState } from "react"
import { CategoriesApi, type CategoryAttrNodeResponse } from "@shop/api/sdk"
import { toApiError } from "@shop/common"

/**
 * useCategorySpecTemplate —— 类目「销售属性」模板（kind === SPEC）的共享加载。
 *
 * 发布页两处都要这份模板：草稿 hook 用它本地算 SKU 组合（失败静默，退化为单规格），
 * 销售信息区用它渲染属性编辑器（失败要给 StateError + 重试）。加载逻辑只此一份，
 * 差异只有「要不要把错误显示出来」——统一暴露 error，由使用方决定是否渲染。
 */
export function useCategorySpecTemplate(categoryId: string | undefined) {
    const [template, setTemplate] = useState<CategoryAttrNodeResponse[] | undefined>()
    const [error, setError] = useState<string | undefined>()
    // 重载信号：重试时自增触发重新拉取
    const [reloadKey, setReloadKey] = useState(0)

    useEffect(() => {
        if (!categoryId) return
        let cancelled = false
        const loadTemplate = async () => {
            try {
                const nodes = await CategoriesApi.getPublicCategoryAttrTemplate({
                    path: { id: categoryId },
                })
                if (cancelled) return
                setTemplate(nodes.filter((n) => n.attr.kind === "SPEC"))
                setError(undefined)
            } catch (loadError) {
                if (!cancelled) setError(toApiError(loadError).detail)
            }
        }
        void loadTemplate()
        return () => {
            cancelled = true
        }
    }, [categoryId, reloadKey])

    return { template, error, retry: () => setReloadKey((k) => k + 1) }
}
