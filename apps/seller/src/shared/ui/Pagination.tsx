import {
    Pagination as UiPagination,
    PaginationContent,
    PaginationEllipsis,
    PaginationItem,
    PaginationLink,
    PaginationNext,
    PaginationPrevious,
} from "@shop/ui-web"

import { paged } from "#/shared/lib/pagination"

/** 底部分页：用 ui-web Pagination 组件（上一页 / 页码带省略 / 下一页）。点击经 onPageChange 写回 URL。 */
export function TablePagination({
    page,
    totalPages,
    onPageChange,
}: {
    page: number
    totalPages: number
    onPageChange: (page: number) => void
}) {
    const pages = paged(page, totalPages)

    // PaginationLink 渲染 <a>，点击时阻止默认跳转交 onPageChange；越界（上/下一页已禁用）不触发
    const go = (target: number) => (e: React.MouseEvent) => {
        e.preventDefault()
        if (target >= 1 && target <= totalPages) onPageChange(target)
    }

    return (
        <UiPagination className="mx-0 justify-end">
            <PaginationContent>
                <PaginationItem>
                    <PaginationPrevious
                        text="上一页"
                        aria-disabled={page <= 1}
                        href={page > 1 ? `#?page=${page - 1}` : undefined}
                        onClick={go(page - 1)}
                    />
                </PaginationItem>
                {pages.map((p, i) =>
                    p === "..." ? (
                        // 省略号以「前一页码」为身份（两段省略号的前页码必不同），不以数组下标作 key
                        <PaginationItem key={`ellipsis-${pages[i - 1] ?? "start"}`}>
                            <PaginationEllipsis />
                        </PaginationItem>
                    ) : (
                        <PaginationItem key={p}>
                            <PaginationLink
                                isActive={p === page}
                                href={`#?page=${p}`}
                                onClick={go(p)}
                            >
                                {p}
                            </PaginationLink>
                        </PaginationItem>
                    ),
                )}
                <PaginationItem>
                    <PaginationNext
                        text="下一页"
                        aria-disabled={page >= totalPages}
                        href={page < totalPages ? `#?page=${page + 1}` : undefined}
                        onClick={go(page + 1)}
                    />
                </PaginationItem>
            </PaginationContent>
        </UiPagination>
    )
}
