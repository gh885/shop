'use client';

import * as React from 'react';
import { type Table } from '@tanstack/react-table';
import { XIcon } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

type DataTableBulkActionsProps<TData> = {
    table: Table<TData>;
    entityName: string;
    children: React.ReactNode;
};

/** 选中行后底部浮出的批量操作条；无选中不渲染 */
export function DataTableBulkActions<TData>({
    table,
    entityName,
    children,
}: DataTableBulkActionsProps<TData>) {
    const selectedCount = table.getFilteredSelectedRowModel().rows.length;

    if (selectedCount === 0) {
        return null;
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
                    <Badge className="min-w-6 rounded-lg">{selectedCount}</Badge>
                    <span className="text-muted-foreground">{entityName} 已选</span>
                </div>
                <Separator
                    orientation="vertical"
                    className="h-5"
                />
                {children}
            </div>
        </div>
    );
}
