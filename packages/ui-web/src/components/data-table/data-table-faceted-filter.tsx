'use client';

import * as React from 'react';
import { type Column } from '@tanstack/react-table';
import { CheckIcon, PlusIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';

export type DataTableFilterOption = {
    label: string;
    value: string;
    icon?: React.ComponentType<{ className?: string }>;
};

export type DataTableFilterConfig = {
    columnId: string;
    title: string;
    options: DataTableFilterOption[];
};

type DataTableFacetedFilterProps<TData, TValue> = {
    column?: Column<TData, TValue>;
    title?: string;
    options: DataTableFilterOption[];
};

/** 多选筛选：Popover 勾选列表 + 触发钮上的已选 Badge（BaseUI 无 Command，故自绘列表） */
export function DataTableFacetedFilter<TData, TValue>({
    column,
    title,
    options,
}: DataTableFacetedFilterProps<TData, TValue>) {
    const facets = column?.getFacetedUniqueValues();
    const selectedValues = new Set(column?.getFilterValue() as string[]);

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
                {selectedValues?.size > 0 && (
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
                        const isSelected = selectedValues.has(option.value);
                        return (
                            <button
                                key={option.value}
                                type="button"
                                onClick={() => {
                                    if (isSelected) {
                                        selectedValues.delete(option.value);
                                    } else {
                                        selectedValues.add(option.value);
                                    }
                                    const filterValues = [...selectedValues];
                                    column?.setFilterValue(
                                        filterValues.length > 0 ? filterValues : undefined,
                                    );
                                }}
                                className="flex items-center gap-2 rounded-md px-1.5 py-1 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
                            >
                                <div
                                    className={cn(
                                        'flex size-4 shrink-0 items-center justify-center rounded-sm border',
                                        isSelected
                                            ? 'border-primary bg-primary text-primary-foreground'
                                            : 'border-muted-foreground/30 [&_svg]:invisible',
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
                            </button>
                        );
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
    );
}
