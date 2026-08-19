"use client"

import { type Table } from "@tanstack/react-table"
import {
    ChevronLeftIcon,
    ChevronRightIcon,
    ChevronsLeftIcon,
    ChevronsRightIcon,
} from "lucide-react"

import { cn, getPageNumbers } from "src/lib/utils"
import { Button } from "src/components/ui/button"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "src/components/ui/select"

type DataTablePaginationProps<TData> = {
    table: Table<TData>
    className?: string
}

/** 分页：页大小 Select + 首/上/页码/下/末 */
export function DataTablePagination<TData>({ table, className }: DataTablePaginationProps<TData>) {
    const currentPage = table.getState().pagination.pageIndex + 1
    const totalPages = table.getPageCount()
    const pageNumbers = getPageNumbers(currentPage, totalPages)

    return (
        <div className={cn("flex flex-wrap items-center justify-between gap-3 px-2", className)}>
            <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">每页</span>
                <Select
                    value={`${table.getState().pagination.pageSize}`}
                    onValueChange={(value) => {
                        table.setPageSize(Number(value))
                    }}
                >
                    <SelectTrigger className="h-8 w-17">
                        <SelectValue placeholder={`${table.getState().pagination.pageSize}`} />
                    </SelectTrigger>
                    <SelectContent side="top">
                        {[10, 20, 30, 40, 50].map((pageSize) => (
                            <SelectItem
                                key={pageSize}
                                value={`${pageSize}`}
                            >
                                {pageSize}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <span className="text-sm text-muted-foreground">行</span>
            </div>

            <div className="flex items-center gap-1.5">
                <span className="me-2 text-sm text-muted-foreground">
                    第 {currentPage}/{totalPages} 页 · 共 {table.getRowCount()} 条
                </span>
                <Button
                    variant="outline"
                    size="icon-sm"
                    onClick={() => table.setPageIndex(0)}
                    disabled={!table.getCanPreviousPage()}
                >
                    <ChevronsLeftIcon />
                    <span className="sr-only">首页</span>
                </Button>
                <Button
                    variant="outline"
                    size="icon-sm"
                    onClick={() => table.previousPage()}
                    disabled={!table.getCanPreviousPage()}
                >
                    <ChevronLeftIcon />
                    <span className="sr-only">上一页</span>
                </Button>

                {pageNumbers.map((pageNumber, index) => (
                    <div
                        // 分页页码固定序列：数字页码唯一，index 仅用于区分重复的省略号分隔符
                        // eslint-disable-next-line react/no-array-index-key
                        key={`${pageNumber}-${index}`}
                        className="flex items-center"
                    >
                        {pageNumber === "..." ? (
                            <span className="px-1 text-sm text-muted-foreground">…</span>
                        ) : (
                            <Button
                                variant={currentPage === pageNumber ? "default" : "outline"}
                                className="h-8 min-w-8 px-2"
                                onClick={() => table.setPageIndex((pageNumber as number) - 1)}
                            >
                                {pageNumber}
                            </Button>
                        )}
                    </div>
                ))}

                <Button
                    variant="outline"
                    size="icon-sm"
                    onClick={() => table.nextPage()}
                    disabled={!table.getCanNextPage()}
                >
                    <ChevronRightIcon />
                    <span className="sr-only">下一页</span>
                </Button>
                <Button
                    variant="outline"
                    size="icon-sm"
                    onClick={() => table.setPageIndex(table.getPageCount() - 1)}
                    disabled={!table.getCanNextPage()}
                >
                    <ChevronsRightIcon />
                    <span className="sr-only">末页</span>
                </Button>
            </div>
        </div>
    )
}
