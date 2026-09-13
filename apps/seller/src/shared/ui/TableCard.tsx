import { Table } from "@shop/ui-web"

import { TablePagination } from "./Pagination"

/**
 * TableCard —— 卖家列表页表格的通用外壳：圆角卡片包表格 + 底部「共 N 条」+ 分页。
 *
 * 商品列表/订单列表等结构一致，差异只在表头表体（children）与计数单位；
 * pageSize/total 决定总页数，翻页写回 URL 由 onPageChange 交给调用方。
 */
export function TableCard({
    total,
    unit,
    page,
    pageSize,
    onPageChange,
    children,
}: {
    total: number
    /** 计数单位，如「件商品」「笔订单」 */
    unit: string
    page: number
    pageSize: number
    onPageChange: (page: number) => void
    children: React.ReactNode
}) {
    return (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
            <Table>{children}</Table>

            <div className="border-t border-border px-4 py-3">
                <div className="mb-2 text-sm text-muted-foreground tabular-nums">
                    共 {total} {unit}
                </div>
                <TablePagination
                    page={page}
                    totalPages={Math.max(1, Math.ceil(total / pageSize))}
                    onPageChange={onPageChange}
                />
            </div>
        </div>
    )
}
