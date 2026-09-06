import { Fragment } from "react"
import { Link } from "@tanstack/react-router"
import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
} from "@shop/ui-web"

/**
 * 页面面包屑 —— 数据驱动，放内容区顶部。
 * 最后一项为当前页（BreadcrumbPage，不可点），前面的项可跳转（带 to）。
 */
export interface Crumb {
    label: string
    /** 可跳转的项才有；当前页不带 to */
    to?: string
}

export function PageBreadcrumb({ crumbs, className }: { crumbs: Crumb[]; className?: string }) {
    return (
        <Breadcrumb className={className}>
            <BreadcrumbList>
                {crumbs.map((crumb, index) => {
                    const isLast = index === crumbs.length - 1
                    // key 用内容（跳转目标/标签）：面包屑路径内不会出现重复项
                    return (
                        <Fragment key={crumb.to ?? crumb.label}>
                            {index > 0 && <BreadcrumbSeparator />}
                            <BreadcrumbItem>
                                {isLast || !crumb.to ? (
                                    <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                                ) : (
                                    <BreadcrumbLink render={<Link to={crumb.to} />}>
                                        {crumb.label}
                                    </BreadcrumbLink>
                                )}
                            </BreadcrumbItem>
                        </Fragment>
                    )
                })}
            </BreadcrumbList>
        </Breadcrumb>
    )
}
