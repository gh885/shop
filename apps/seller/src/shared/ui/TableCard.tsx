import { PaginationBar } from "@shop/app-kit/data"
import { Table, TableShell } from "@shop/ui-web"

import { useT } from "#/locales/use-t"

export function TableCard({
    total,
    unit,
    page,
    pageSize,
    onPageChange,
    children,
}: {
    total: number
    unit: string
    page: number
    pageSize: number
    onPageChange: (page: number) => void
    children: React.ReactNode
}) {
    const t = useT("common")
    const totalPages = Math.max(1, Math.ceil(total / pageSize))

    return (
        <TableShell
            footer={
                <>
                    <span className="text-sm text-muted-foreground tabular-nums">
                        {t("common.tableCard.total", { total, unit })}
                    </span>
                    <PaginationBar
                        page={page}
                        totalPages={totalPages}
                        onPageChange={onPageChange}
                        className="mx-0 w-auto"
                    />
                </>
            }
        >
            <Table>{children}</Table>
        </TableShell>
    )
}
