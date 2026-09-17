"use client"

import * as React from "react"
import { Subscribe, type Column, type RowData } from "@tanstack/react-table"
import { CheckIcon, PlusIcon } from "lucide-react"

import { cn } from "src/lib/utils"
import { Badge } from "src/components/ui/badge"
import { Button } from "src/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "src/components/ui/popover"
import { Separator } from "src/components/ui/separator"

import type { DataTableFeatures } from "./data-table-features"

export type DataTableFilterOption = {
    label: string
    value: string
    icon?: React.ComponentType<{ className?: string }>
}

export type DataTableFilterConfig = {
    columnId: string
    title: string
    options: DataTableFilterOption[]
}

type DataTableFacetedFilterProps<TData extends RowData, TValue> = {
    column?: Column<DataTableFeatures, TData, TValue>
    title?: string
    options: DataTableFilterOption[]
}

/** 多选分面筛选；客户端标量列需显式配置 filterFn: "arrHas"。 */
export function DataTableFacetedFilter<TData extends RowData, TValue>({
    column,
    title,
    options,
}: DataTableFacetedFilterProps<TData, TValue>) {
    if (!column) return
    return (
        <Subscribe source={column.table.store}>
            {(state) => (
                <FacetedFilterContent
                    column={column}
                    title={title}
                    options={options}
                    filterValue={
                        state.columnFilters.find((filter) => filter.id === column.id)?.value
                    }
                />
            )}
        </Subscribe>
    )
}

function FacetedFilterContent<TData extends RowData, TValue>({
    column,
    title,
    options,
    filterValue,
}: DataTableFacetedFilterProps<TData, TValue> & { filterValue: unknown }) {
    // 服务端分页不能把当前页的计数冒充全量分面计数。
    const facets =
        column?.table.options.manualFiltering || column?.table.options.manualPagination
            ? undefined
            : column?.getFacetedUniqueValues()
    const selectedValues = new Set<string>(
        Array.isArray(filterValue)
            ? filterValue.filter((v): v is string => typeof v === "string")
            : [],
    )

    return (
        <Popover>
            <PopoverTrigger
                render={
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-8 border-dashed"
                    />
                }
            >
                <PlusIcon className="size-3.5" />
                {title}
                {selectedValues.size > 0 && (
                    <>
                        <Separator
                            orientation="vertical"
                            className="mx-2 h-4"
                        />
                        <Badge
                            variant="secondary"
                            className="rounded-sm px-1 font-normal lg:hidden"
                        >
                            {selectedValues.size}
                        </Badge>
                        <div className="hidden space-x-1 lg:flex">
                            {selectedValues.size > 2 ? (
                                <Badge
                                    variant="secondary"
                                    className="rounded-sm px-1 font-normal"
                                >
                                    {selectedValues.size} 已选
                                </Badge>
                            ) : (
                                options
                                    .filter((option) => selectedValues.has(option.value))
                                    .map((option) => (
                                        <Badge
                                            variant="secondary"
                                            key={option.value}
                                            className="rounded-sm px-1 font-normal"
                                        >
                                            {option.label}
                                        </Badge>
                                    ))
                            )}
                        </div>
                    </>
                )}
            </PopoverTrigger>
            <PopoverContent
                className="w-56 p-1"
                align="start"
            >
                <div className="flex flex-col gap-0.5">
                    {options.map((option) => {
                        const isSelected = selectedValues.has(option.value)
                        return (
                            <Button
                                key={option.value}
                                type="button"
                                variant="ghost"
                                aria-pressed={isSelected}
                                onClick={() => {
                                    if (isSelected) {
                                        selectedValues.delete(option.value)
                                    } else {
                                        selectedValues.add(option.value)
                                    }
                                    const filterValues = [...selectedValues]
                                    column?.setFilterValue(
                                        filterValues.length > 0 ? filterValues : undefined,
                                    )
                                }}
                                className="justify-start"
                            >
                                <div
                                    className={cn(
                                        "flex size-4 shrink-0 items-center justify-center rounded-sm border",
                                        isSelected
                                            ? "border-foreground bg-accent text-accent-foreground"
                                            : "border-muted-foreground/30 [&_svg]:invisible",
                                    )}
                                >
                                    <CheckIcon className="size-3" />
                                </div>
                                {option.icon && (
                                    <option.icon className="size-4 text-muted-foreground" />
                                )}
                                <span className="flex-1 truncate text-start">{option.label}</span>
                                {facets?.get(option.value) && (
                                    <span className="font-mono text-xs text-muted-foreground">
                                        {facets.get(option.value)}
                                    </span>
                                )}
                            </Button>
                        )
                    })}
                    {selectedValues.size > 0 && (
                        <>
                            <Separator className="my-1" />
                            <Button
                                variant="ghost"
                                size="sm"
                                className="justify-center"
                                onClick={() => column?.setFilterValue(undefined)}
                            >
                                清除筛选
                            </Button>
                        </>
                    )}
                </div>
            </PopoverContent>
        </Popover>
    )
}
