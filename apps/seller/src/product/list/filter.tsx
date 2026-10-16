import { useState } from "react"
import { Button, Input, Tabs, TabsList, TabsTrigger } from "@shop/ui-web"
import { RotateCcw, Search } from "lucide-react"

import type { ProductStatus } from "@shop/api/sdk"
import { useT } from "#/locales/use-t"
import { PRODUCT_STATUS_TABS } from "#/product/constants"

// 筛选值 = URL 可同步的查询子集
export interface ProductListFilter {
    status: ProductStatus
    title?: string
}

const DEFAULT_FILTER: ProductListFilter = {
    status: "PUBLISHED",
}

// onValueChange 给 string，用唯一来源 PRODUCT_STATUS_TABS 收窄成枚举（加状态只改 tabs 一处）
const isStatusTab = (v: string): v is ProductStatus =>
    PRODUCT_STATUS_TABS.some((t) => t.value === v)

interface FilterBarProps {
    value: ProductListFilter
    onChange: (next: ProductListFilter) => void
}

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

// 只留后端真支持的维度：列表查询的 keyword 走商品名 LIKE，不要在此补商品ID/编号框（后端会静默忽略，等于给一个填了不生效的假筛选）
export function FilterBar({ value, onChange }: FilterBarProps) {
    const t = useT()
    const [title, setTitle] = useState(value.title ?? "")

    function apply(next: ProductListFilter) {
        onChange(next)
        // 让本地草稿跟随新值：切页签时不要把用户已输入的关键词丢掉
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
                    label={t("product.filter.title.label")}
                    className="min-w-40 flex-1 max-w-56"
                    placeholder={t("product.filter.title.placeholder")}
                    value={title}
                    onChange={setTitle}
                />
                <Button type="submit">
                    <Search className="size-4" />
                    {t("ui.search.button")}
                </Button>
                <Button
                    type="button"
                    variant="outline"
                    onClick={reset}
                >
                    <RotateCcw className="size-4" />
                    {t("ui.dataTable.reset")}
                </Button>
            </form>
        </div>
    )
}
