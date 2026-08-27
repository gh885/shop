import { Search } from "lucide-react"

import { Button, Input } from "@shop/ui-web"

/**
 * 「我的收藏」页头工具栏：标题 + 批量管理按钮 + 搜索。
 *
 * 纯展示（受控）：关键词、批量模式开关都由外部持有，组件只负责反馈输入。
 * 与地址页头部（标题 + 单个按钮）风格一致，但右侧更复杂（按钮 + 搜索框并排）。
 */

export interface FavoritesToolbarProps {
    /** 收藏总数（标题旁小字） */
    total?: number
    /** 搜索关键词（受控） */
    keyword: string
    onKeywordChange: (value: string) => void
    /** 批量管理模式开关 */
    batchMode: boolean
    onToggleBatchMode: () => void
    /** 批量模式下选中数量（>0 时按钮高亮） */
    selectedCount?: number
}

export function FavoritesToolbar({
    total,
    keyword,
    onKeywordChange,
    batchMode,
    onToggleBatchMode,
    selectedCount = 0,
}: FavoritesToolbarProps) {
    return (
        <div className="flex items-center justify-between gap-4">
            {/* 左侧：标题 + 总数 */}
            <div className="flex items-baseline gap-2">
                <h1 className="text-xl font-bold">我的收藏</h1>
                {total !== undefined && (
                    <span className="text-sm text-muted-foreground">共 {total} 件</span>
                )}
            </div>

            {/* 右侧：批量管理 + 搜索 */}
            <div className="flex items-center gap-3">
                <Button
                    variant={batchMode && selectedCount > 0 ? "default" : "outline"}
                    onClick={onToggleBatchMode}
                >
                    批量管理
                    {batchMode && selectedCount > 0 && `（${selectedCount}）`}
                </Button>

                <div className="relative">
                    <Input
                        value={keyword}
                        onChange={(e) => onKeywordChange(e.target.value)}
                        placeholder="搜索"
                        className="w-56 pr-8"
                    />
                    <Search className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                </div>
            </div>
        </div>
    )
}
