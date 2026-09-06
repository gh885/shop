import { useState } from "react"
import { Button, Input, Tabs, TabsList, TabsTrigger } from "@shop/ui-web"
import { RotateCcw, Search } from "lucide-react"

import { PRODUCT_STATUS_TABS, type ProductStatusFilter } from "#/products/constants"

/** 商品列表筛选值（URL 可同步的查询子集） */
export interface ProductListFilter {
    status: ProductStatusFilter
    /** 商品标题关键词 */
    title?: string
    /** 商品 ID（精确） */
    productId?: string
    /** 商家编码（精确） */
    merchantCode?: string
}

/** 默认筛选：在售 */
const DEFAULT_FILTER: ProductListFilter = {
    status: "PUBLISHED",
}

interface FilterBarProps {
    value: ProductListFilter
    onChange: (next: ProductListFilter) => void
}

/**
 * 商品列表筛选栏（页签 + 三个搜索框）。
 *
 * 受控组件：筛选值由容器经 props 传入（容器负责 URL 读写），本组件只发变更。
 * 三个文本搜索框用本地草稿暂存，点「搜索」才一次性提交，避免每击键都写 URL / 发请求；
 * 页签切换为即时提交（切了就要刷新列表）。「重置」把三个草稿清空并恢复默认页签。
 */
export function FilterBar({ value, onChange }: FilterBarProps) {
    const [title, setTitle] = useState(value.title ?? "")
    const [productId, setProductId] = useState(value.productId ?? "")
    const [merchantCode, setMerchantCode] = useState(value.merchantCode ?? "")

    function apply(next: ProductListFilter) {
        onChange(next)
        // 意图一致的当前草稿跟随（切页签也会把当前打字内容带过去，避免已输入却丢）
        setTitle(next.title ?? "")
        setProductId(next.productId ?? "")
        setMerchantCode(next.merchantCode ?? "")
    }

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        apply({
            status: value.status,
            title: title.trim() || undefined,
            productId: productId.trim() || undefined,
            merchantCode: merchantCode.trim() || undefined,
        })
    }

    function reset() {
        setTitle("")
        setProductId("")
        setMerchantCode("")
        onChange({ ...DEFAULT_FILTER })
    }

    return (
        <div className="space-y-4">
            <Tabs
                value={value.status}
                onValueChange={(next) => {
                    if (next === "PUBLISHED" || next === "WAREHOUSE" || next === "DRAFT") {
                        apply({ ...value, status: next })
                    }
                }}
            >
                <TabsList variant="line">
                    {PRODUCT_STATUS_TABS.map((tab) => (
                        <TabsTrigger
                            key={tab.value}
                            value={tab.value}
                        >
                            {tab.label}
                        </TabsTrigger>
                    ))}
                </TabsList>
            </Tabs>

            <form
                className="flex items-end gap-2"
                onSubmit={handleSubmit}
            >
                <label
                    htmlFor="filter-title"
                    className="flex flex-col gap-1 text-xs text-muted-foreground"
                >
                    商品标题
                    <Input
                        id="filter-title"
                        className="w-56"
                        placeholder="如：无线蓝牙耳机"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                    />
                </label>
                <label
                    htmlFor="filter-product-id"
                    className="flex flex-col gap-1 text-xs text-muted-foreground"
                >
                    商品 ID
                    <Input
                        id="filter-product-id"
                        className="w-44"
                        placeholder="输入完整 ID 精确匹配"
                        value={productId}
                        onChange={(e) => setProductId(e.target.value)}
                    />
                </label>
                <label
                    htmlFor="filter-merchant-code"
                    className="flex flex-col gap-1 text-xs text-muted-foreground"
                >
                    商家编号
                    <Input
                        id="filter-merchant-code"
                        className="w-44"
                        placeholder="输入完整编号精确匹配"
                        value={merchantCode}
                        onChange={(e) => setMerchantCode(e.target.value)}
                    />
                </label>
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
