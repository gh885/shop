"use client"

import * as React from "react"
import { type ReactTable, type RowData } from "@tanstack/react-table"
import { XIcon } from "lucide-react"

import { Badge } from "src/components/ui/badge"
import { Button } from "src/components/ui/button"
import { Separator } from "src/components/ui/separator"

import type { DataTableFeatures } from "./data-table-features"

type DataTableBulkActionsProps<TData extends RowData> = {
    table: ReactTable<DataTableFeatures, TData>
    entityName: string
    children: React.ReactNode
}

/** 选中行后底部浮出的批量操作条；无选中不渲染 */
export function DataTableBulkActions<TData extends RowData>({
    table,
    entityName,
    children,
}: DataTableBulkActionsProps<TData>) {
    // rowSelection 可保留跨页 ID，row model 只有当前加载的数据。
    const selectedCount = Object.keys(table.state.rowSelection).length

    if (selectedCount === 0) {
        return
    }

    return (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
            <div className="flex items-center gap-2 rounded-xl border bg-background/95 px-3 py-2 shadow-lg backdrop-blur supports-backdrop-filter:bg-background/60">
                <Button
                    variant="ghost"
                    size="icon-sm"
                    className="size-6 rounded-full"
                    onClick={() => table.resetRowSelection()}
                    title="清空选择"
                >
                    <XIcon />
                    <span className="sr-only">清空选择</span>
                </Button>
                <Separator
                    orientation="vertical"
                    className="h-5"
                />
                <div className="flex items-center gap-1.5 text-sm">
                    <Badge
                        variant="secondary"
                        className="min-w-6 rounded-lg"
                    >
                        {selectedCount}
                    </Badge>
                    <span className="text-muted-foreground">{entityName} 已选</span>
                </div>
                <Separator
                    orientation="vertical"
                    className="h-5"
                />
                {children}
            </div>
        </div>
    )
}
