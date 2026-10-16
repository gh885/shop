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

export interface Crumb {
    label: string
    to?: string
}

export function PageBreadcrumb({ crumbs, className }: { crumbs: Crumb[]; className?: string }) {
    return (
        <Breadcrumb className={className}>
            <BreadcrumbList>
                {crumbs.map((crumb, index) => {
                    const isLast = index === crumbs.length - 1
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
