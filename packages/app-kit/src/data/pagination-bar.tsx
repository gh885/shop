import {
    paged,
    Pagination,
    PaginationContent,
    PaginationEllipsis,
    PaginationItem,
    PaginationLink,
    PaginationNext,
    PaginationPrevious,
} from "@shop/ui-web"

import { useT } from "../i18n"

/** 三端列表分页条唯一渲染处：页码算法 `paged` 在 ui-web，表格分页在 ui-web 的 DataTableCard，不重复实现 */

/** 只认 page/totalPages，页码存哪（URL 还是 state）归调用方；只有一页时整条不渲染 */
export function PaginationBar({
    page,
    totalPages,
    onPageChange,
    className,
}: {
    page: number
    totalPages: number
    onPageChange: (page: number) => void
    /** 对齐方式等：默认居中，表格卡片内一般要 `mx-0 justify-end` */
    className?: string
}) {
    const t = useT()
    // oxlint-disable-next-line unicorn/no-null -- React 的「什么都不渲染」就是 null，不是对内传值
    if (totalPages <= 1) return null

    const pages = paged(page, totalPages)

    // PaginationLink 渲染 <a>，点击阻止默认跳转交 onPageChange。
    // 越界仍要守在这里：禁用态的 href 让 <a> 保持可聚焦，键盘回车绕得过 pointer-events。
    const go = (target: number) => (e: React.MouseEvent) => {
        e.preventDefault()
        if (target >= 1 && target <= totalPages) onPageChange(target)
    }

    return (
        <Pagination className={className}>
            <PaginationContent>
                <PaginationItem>
                    <PaginationPrevious
                        text={t("ui.dataTable.previousPage")}
                        aria-label={t("ui.dataTable.previousPage")}
                        href={`#?page=${page - 1}`}
                        disabled={page <= 1}
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
                        text={t("ui.dataTable.nextPage")}
                        aria-label={t("ui.dataTable.nextPage")}
                        href={`#?page=${page + 1}`}
                        disabled={page >= totalPages}
                        onClick={go(page + 1)}
                    />
                </PaginationItem>
            </PaginationContent>
        </Pagination>
    )
}
