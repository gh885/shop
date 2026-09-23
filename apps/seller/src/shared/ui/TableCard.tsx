import { PaginationBar } from "@shop/app-kit"
import { Table } from "@shop/ui-web"

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
    const totalPages = Math.max(1, Math.ceil(total / pageSize))

    return (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
            <Table>{children}</Table>

            {/* 一行两栏：计数在左、分页在右。只有一页时分页整条不渲染，靠 flex 而不是条件类维持间距 */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3">
                <span className="text-sm text-muted-foreground tabular-nums">
                    共 {total} {unit}
                </span>
                <PaginationBar
                    page={page}
                    totalPages={totalPages}
                    onPageChange={onPageChange}
                    className="mx-0 w-auto"
                />
            </div>
        </div>
    )
}
