import { useState } from "react"
import { Button, Input, Tabs, TabsList, TabsTrigger } from "@shop/ui-web"
import { RotateCcw, Search } from "lucide-react"

import type { ProductStatus } from "@shop/api/sdk"
import { useT } from "#/locales/use-t"
import { PRODUCT_STATUS_TABS } from "#/product/constants"

/** 商品列表筛选值（URL 可同步的查询子集） */
export interface ProductListFilter {
    status: ProductStatus
    /** 商品标题关键词 */
    title?: string
}

/** 默认筛选：上架中 */
const DEFAULT_FILTER: ProductListFilter = {
    status: "PUBLISHED",
}

/** Tabs 的 onValueChange 给 string，用唯一来源 PRODUCT_STATUS_TABS 收窄成状态枚举（加状态只改 tabs 一处） */
const isStatusTab = (v: string): v is ProductStatus =>
    PRODUCT_STATUS_TABS.some((t) => t.value === v)

interface FilterBarProps {
    value: ProductListFilter
    onChange: (next: ProductListFilter) => void
}

/**
 * 筛选栏的紧凑输入项：小字灰标签在上、输入框在下。
 *
 * 不复用 ui-web 的 FieldShell：它的标签是表单档（FieldLabel = text-sm font-medium），
 * 筛选栏要的是更轻的一档。三个筛选项共用这一处定义，宽度差由 className 传。
 */
function FilterField({
    id,
    label,
    className,
    placeholder,
    value,
    onChange,
}: {
    id: string
    label: string
    /** 输入框宽度档（筛选栏按内容给宽窄，属布局，归调用方） */
    className?: string
    placeholder: string
    value: string
    onChange: (next: string) => void
}) {
    return (
        <label
            htmlFor={id}
            className="flex flex-col gap-1 text-xs text-muted-foreground"
        >
            {label}
            <Input
                id={id}
                className={className}
                placeholder={placeholder}
                value={value}
                onChange={(e) => onChange(e.target.value)}
            />
        </label>
    )
}

/**
 * 商品列表筛选栏（页签 + 标题关键词搜索框）。
 *
 * 受控组件：筛选值由容器经 props 传入（容器负责 URL 读写），本组件只发变更。
 * 只留后端真支持的维度：列表查询（`/seller/products` 的 `keyword`）走的是商品名 LIKE，
 * 曾经这里还有「商品 ID」「商家编号」两个框，输入后在 `use-product-list` 的 apply() 处被静默丢掉
 * ——填了拿到的是未过滤列表，比没有这个框更糟。要按编号检索得先加后端查询参数，不是这里补 UI。
 * 文本框用本地草稿暂存，点「搜索」才提交，避免每击键都写 URL / 发请求；
 * 页签切换为即时提交（切了就要刷新列表）。「重置」清空草稿并恢复默认页签。
 */
export function FilterBar({ value, onChange }: FilterBarProps) {
    const t = useT()
    const [title, setTitle] = useState(value.title ?? "")

    function apply(next: ProductListFilter) {
        onChange(next)
        // 意图一致的当前草稿跟随（切页签也会把当前打字内容带过去，避免已输入却丢）
        setTitle(next.title ?? "")
    }

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        apply({
            status: value.status,
            title: title.trim() || undefined,
        })
    }

    function reset() {
        setTitle("")
        onChange({ ...DEFAULT_FILTER })
    }

    return (
        <div className="space-y-4">
            <Tabs
                value={value.status}
                onValueChange={(next) => {
                    if (isStatusTab(next)) apply({ ...value, status: next })
                }}
            >
                <TabsList variant="line">
                    {PRODUCT_STATUS_TABS.map((tab) => (
                        <TabsTrigger
                            key={tab.value}
                            value={tab.value}
                        >
                            {t(tab.labelKey)}
                        </TabsTrigger>
                    ))}
                </TabsList>
            </Tabs>

            <form
                className="flex flex-wrap items-end gap-2"
                onSubmit={handleSubmit}
            >
                <FilterField
                    id="filter-title"
                    label="商品标题"
                    className="min-w-40 flex-1 max-w-56"
                    placeholder="如：无线蓝牙耳机"
                    value={title}
                    onChange={setTitle}
                />
                <Button type="submit">
                    <Search className="size-4" />
                    搜索
                </Button>
                <Button
                    type="button"
                    variant="outline"
                    onClick={reset}
                >
                    <RotateCcw className="size-4" />
                    重置
                </Button>
            </form>
        </div>
    )
}
