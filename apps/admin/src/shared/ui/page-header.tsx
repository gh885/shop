import type { ReactNode } from "react"

/** 管理端页头：标题 + 说明，右侧挂页面级动作（新建等） */
export function PageHeader({
    title,
    description,
    actions,
}: {
    title: string
    description: ReactNode
    actions?: ReactNode
}) {
    return (
        <div className="flex items-start justify-between">
            <div>
                <h1 className="text-lg font-semibold">{title}</h1>
                <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
            </div>
            {actions}
        </div>
    )
}
