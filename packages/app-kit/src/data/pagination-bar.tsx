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

/**
 * 三端列表分页条 —— 渲染在这一处，页码算法 `paged` 在 ui-web。
 *
 * 之前有四份：卖家端（编号页码 + 省略号）、买家订单页（5 页滑动窗口，无省略号）、
 * 买家券包页（只有上一页/下一页）、以及后来交给 reui `DataGridPagination` 的表格分页条
 * （表格现在不在这里，见 ui-web 的 DataTableCard）。
 * 前两份是同一件事的两种做法，滑动窗口那份在尾页会「1 2 3 4 5」一路平推到中段才收敛，
 * 用户看不见总共有多少页，也跳不到最后。
 */

/**
 * 编号页码分页条：上一页 / 页码（带省略号）/ 下一页。
 *
 * 只认 `page` 与 `totalPages` 两个数字，翻页动作整个交给 `onPageChange` —— 页码存在哪
 * （URL search 还是 useState）是调用方的事，两种都有人在用，不在这层替他们选。
 * 只有一页时整条不渲染：「上一页 1 下一页」不传递任何信息，还白占一行高度。
 */
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
                        text={t("appKit.ui.dataTable.previousPage")}
                        aria-label={t("appKit.ui.dataTable.previousPage")}
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
                        text={t("appKit.ui.dataTable.nextPage")}
                        aria-label={t("appKit.ui.dataTable.nextPage")}
                        href={`#?page=${page + 1}`}
                        disabled={page >= totalPages}
                        onClick={go(page + 1)}
                    />
                </PaginationItem>
            </PaginationContent>
        </Pagination>
    )
}
