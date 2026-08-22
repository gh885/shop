import { MessageSquareOff } from "lucide-react"

import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@shop/ui-web"

import { DetailSection } from "./detail-section"

/** 用户评价：评价模块后端未建，先占位 */
export function ReviewsSection() {
    return (
        <DetailSection
            id="reviews"
            title="用户评价"
        >
            <Empty className="border border-dashed">
                <EmptyHeader>
                    <EmptyMedia variant="icon">
                        <MessageSquareOff />
                    </EmptyMedia>
                    <EmptyTitle>暂无评价</EmptyTitle>
                    <EmptyDescription>评价功能即将上线</EmptyDescription>
                </EmptyHeader>
            </Empty>
        </DetailSection>
    )
}
