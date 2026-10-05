import { Search } from "lucide-react"

import { Button, Checkbox, InputGroup, InputGroupAddon, InputGroupInput } from "@shop/ui-web"

import { useT } from "#/locales/use-t"

/**
 * 「我的收藏」页头工具栏。受控组件：关键词、批量模式、选中集合全部由外部持有。
 * 常规态：标题「我的收藏」(共N件) + 右侧「批量管理」+ 搜索框。
 * 批量态：标题保留，右侧变「删除」「退出管理」+ 搜索框；标题下方新增「全选」+ 已选计数。
 */

export interface ToolbarProps {
    /** 收藏总数（标题旁小字） */
    total?: number
    /** 搜索关键词（受控） */
    keyword: string
    onKeywordChange: (value: string) => void
    /** 批量管理模式开关 */
    batchMode: boolean
    onToggleBatchMode: () => void
    /** 批量模式下选中数量 */
    selectedCount?: number
    /** 是否全选（全选复选框受控态） */
    allSelected?: boolean
    onToggleSelectAll: (checked: boolean) => void
    /** 批量删除（移除所有选中） */
    onBatchDelete: () => void
}

export function Toolbar({
    total,
    keyword,
    onKeywordChange,
    batchMode,
    onToggleBatchMode,
    selectedCount = 0,
    allSelected = false,
    onToggleSelectAll,
    onBatchDelete,
}: ToolbarProps) {
    const t = useT()

    return (
        <div className="space-y-3">
            {/* 头行：标题（常驻）+ 右侧操作 + 搜索 */}
            <div className="flex items-center justify-between gap-4">
                <div className="flex items-baseline gap-2">
                    <h1 className="text-xl font-bold">{t("web.favorite.title")}</h1>
                    {!batchMode && total !== undefined && (
                        <span className="text-sm text-muted-foreground">
                            {t("web.favorite.totalCount", { total })}
                        </span>
                    )}
                </div>

                <div className="flex items-center gap-3">
                    {batchMode ? (
                        <>
                            <Button
                                variant="outline"
                                disabled={selectedCount === 0}
                                onClick={onBatchDelete}
                            >
                                {t("web.favorite.delete")}
                            </Button>
                            <Button
                                variant="outline"
                                onClick={onToggleBatchMode}
                            >
                                {t("web.favorite.exitManage")}
                            </Button>
                        </>
                    ) : (
                        <Button
                            variant="outline"
                            onClick={onToggleBatchMode}
                        >
                            {t("web.favorite.batchManage")}
                        </Button>
                    )}

                    <InputGroup className="w-56">
                        <InputGroupInput
                            value={keyword}
                            onChange={(e) => onKeywordChange(e.target.value)}
                            placeholder={t("web.favorite.searchPlaceholder")}
                            aria-label={t("web.favorite.searchAria")}
                        />
                        <InputGroupAddon align="inline-end">
                            <Search className="size-4 text-muted-foreground" />
                        </InputGroupAddon>
                    </InputGroup>
                </div>
            </div>

            {/* 批量态：全选 + 已选计数 */}
            {batchMode && (
                <div className="flex items-center gap-2">
                    <Checkbox
                        checked={allSelected}
                        onCheckedChange={(checked) => onToggleSelectAll(checked)}
                        aria-label={t("web.favorite.selectAllAria")}
                    />
                    <span className="text-sm text-muted-foreground">
                        {t("web.favorite.selectedCount", { selectedCount })}
                    </span>
                </div>
            )}
        </div>
    )
}
