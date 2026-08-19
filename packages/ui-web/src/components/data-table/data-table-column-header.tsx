"use client"

import * as React from "react"
import { type Column } from "@tanstack/react-table"
import { ArrowDownIcon, ArrowUpIcon, ChevronsUpDownIcon, EyeOffIcon } from "lucide-react"

import { cn } from "src/lib/utils"
import { Button } from "src/components/ui/button"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "src/components/ui/dropdown-menu"

type DataTableColumnHeaderProps<TData, TValue> = React.HTMLAttributes<HTMLDivElement> & {
    column: Column<TData, TValue>
    title: string
}

/** 列头：可排序则下拉升序/降序/隐藏，不可排序渲染纯标题 */
export function DataTableColumnHeader<TData, TValue>({
    column,
    title,
    className,
}: DataTableColumnHeaderProps<TData, TValue>) {
    if (!column.getCanSort()) {
        return <div className={cn(className)}>{title}</div>
    }

    return (
        <div className={cn("flex items-center gap-2", className)}>
            <DropdownMenu>
                <DropdownMenuTrigger
                    render={
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 -ms-2 gap-1 px-2"
                        />
                    }
                >
                    <span>{title}</span>
                    {column.getIsSorted() === "desc" ? (
                        <ArrowDownIcon className="size-3.5" />
                    ) : column.getIsSorted() === "asc" ? (
                        <ArrowUpIcon className="size-3.5" />
                    ) : (
                        <ChevronsUpDownIcon className="size-3.5" />
                    )}
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                    <DropdownMenuItem onClick={() => column.toggleSorting(false)}>
                        <ArrowUpIcon className="size-3.5 text-muted-foreground/70" />
                        升序
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => column.toggleSorting(true)}>
                        <ArrowDownIcon className="size-3.5 text-muted-foreground/70" />
                        降序
                    </DropdownMenuItem>
                    {column.getCanHide() && (
                        <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => column.toggleVisibility(false)}>
                                <EyeOffIcon className="size-3.5 text-muted-foreground/70" />
                                隐藏
                            </DropdownMenuItem>
                        </>
                    )}
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    )
}
