import type { ReactNode } from "react"

import { Card, CardContent } from "@shop/ui-web"

/**
 * 左栏通用区块壳：锚点 id（tab 滚动目标）+ 统一标题样式 + scroll-mt
 * （预留吸顶 tab 条高度，scrollIntoView 落点不被遮挡）。
 */
export function DetailSection({
    id,
    title,
    children,
}: {
    id: string
    title: string
    children: ReactNode
}) {
    return (
        <Card
            id={id}
            className="mt-5 scroll-mt-20"
        >
            <CardContent>
                <h2 className="mb-4 border-l-4 border-primary pl-3 text-lg font-bold text-foreground">
                    {title}
                </h2>
                {children}
            </CardContent>
        </Card>
    )
}
