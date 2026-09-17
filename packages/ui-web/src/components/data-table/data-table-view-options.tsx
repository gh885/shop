"use client"

import { type ReactTable, type RowData } from "@tanstack/react-table"
import { SlidersHorizontalIcon } from "lucide-react"

import { Button } from "src/components/ui/button"
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "src/components/ui/dropdown-menu"

import type { DataTableFeatures } from "./data-table-features"

type DataTableViewOptionsProps<TData extends RowData> = {
    table: ReactTable<DataTableFeatures, TData>
}

/** 列显隐：下拉勾选（accessor 列可隐藏，隐藏态列与 action 列不出现） */
export function DataTableViewOptions<TData extends RowData>({
    table,
}: DataTableViewOptionsProps<TData>) {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger
                render={
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1.5"
                    />
                }
            >
                <SlidersHorizontalIcon className="size-3.5" />列
            </DropdownMenuTrigger>
            <DropdownMenuContent
                align="end"
                className="w-40"
            >
                <DropdownMenuGroup>
                    <DropdownMenuLabel>显示列</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {table
                        .getAllColumns()
                        .filter((column) => column.accessorFn !== undefined && column.getCanHide())
                        .map((column) => (
                            <DropdownMenuCheckboxItem
                                key={column.id}
                                className="capitalize"
                                checked={column.getIsVisible()}
                                onCheckedChange={(value) => column.toggleVisibility(value)}
                            >
                                {typeof column.columnDef.header === "string"
                                    ? column.columnDef.header
                                    : column.id}
                            </DropdownMenuCheckboxItem>
                        ))}
                </DropdownMenuGroup>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
