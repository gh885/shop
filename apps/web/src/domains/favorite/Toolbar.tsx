import { Search } from "lucide-react"

import { Button, Checkbox, InputGroup, InputGroupAddon, InputGroupInput } from "@shop/ui-web"

import { useT } from "#/locales/use-t"

export interface ToolbarProps {
    total?: number
    keyword: string
    onKeywordChange: (value: string) => void
    batchMode: boolean
    onToggleBatchMode: () => void
    selectedCount?: number
    allSelected?: boolean
    onToggleSelectAll: (checked: boolean) => void
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
            <div className="flex items-center justify-between gap-4">
                <div className="flex items-baseline gap-2">
                    <h1 className="text-xl font-bold">{t("favorite.title")}</h1>
                    {!batchMode && total !== undefined && (
                        <span className="text-sm text-muted-foreground">
                            {t("favorite.totalCount", { total })}
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
                                {t("favorite.delete")}
                            </Button>
                            <Button
                                variant="outline"
                                onClick={onToggleBatchMode}
                            >
                                {t("favorite.exitManage")}
                            </Button>
                        </>
                    ) : (
                        <Button
                            variant="outline"
                            onClick={onToggleBatchMode}
                        >
                            {t("favorite.batchManage")}
                        </Button>
                    )}

                    <InputGroup className="w-56">
                        <InputGroupInput
                            value={keyword}
                            onChange={(e) => onKeywordChange(e.target.value)}
                            placeholder={t("favorite.searchPlaceholder")}
                            aria-label={t("favorite.searchAria")}
                        />
                        <InputGroupAddon align="inline-end">
                            <Search className="size-4 text-muted-foreground" />
                        </InputGroupAddon>
                    </InputGroup>
                </div>
            </div>

            {batchMode && (
                <div className="flex items-center gap-2">
                    <Checkbox
                        checked={allSelected}
                        onCheckedChange={(checked) => onToggleSelectAll(checked)}
                        aria-label={t("favorite.selectAllAria")}
                    />
                    <span className="text-sm text-muted-foreground">
                        {t("favorite.selectedCount", { selectedCount })}
                    </span>
                </div>
            )}
        </div>
    )
}
