import { useEffect, useState } from "react"
import { MessageSquareOff } from "lucide-react"

import {
    Tabs,
    TabsList,
    TabsTrigger,
    Empty,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
} from "@shop/ui-web"

import type { ProductDetail } from "#/product"
import { Sticky } from "#/shared/ui/Sticky"

import { DetailSection } from "./DetailSection"

/** 左栏区块定义（顺序即 tab 顺序），也是 scrollspy 的观察目标 */
const DETAIL_SECTIONS = [
    { id: "reviews", label: "用户评价" },
    { id: "params", label: "参数信息" },
    { id: "detail", label: "图文详情" },
    { id: "shop-reco", label: "本店推荐" },
    { id: "also-viewed", label: "看了又看" },
] as const

/**
 * 商品详情左栏主体：吸顶 tab + 评价/参数/图文详情三个区块。
 * 本店推荐与看了又看作为独立 widget 跟在后面，便于各自维护数据请求。
 */
export function DetailSections({ detail }: { detail: ProductDetail }) {
    const [active, setActive] = useState<string>(DETAIL_SECTIONS[0].id)

    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    if (entry.isIntersecting) setActive(entry.target.id)
                }
            },
            { rootMargin: "-10% 0px -70% 0px" },
        )
        for (const { id } of DETAIL_SECTIONS) {
            const el = document.getElementById(id)
            if (el) observer.observe(el)
        }
        return () => observer.disconnect()
    }, [])

    return (
        <>
            <Sticky top={0}>
                <div className="rounded-2xl bg-background">
                    <Tabs
                        value={active}
                        onValueChange={(value) => {
                            document
                                .getElementById(value)
                                ?.scrollIntoView({ behavior: "smooth", block: "start" })
                        }}
                    >
                        <TabsList variant="line">
                            {DETAIL_SECTIONS.map((s) => (
                                <TabsTrigger
                                    key={s.id}
                                    value={s.id}
                                    className="px-4 text-base data-active:text-primary data-active:after:bg-primary"
                                >
                                    {s.label}
                                </TabsTrigger>
                            ))}
                        </TabsList>
                    </Tabs>
                </div>
            </Sticky>

            <ReviewsSection />
            <ParamsSection params={detail.params} />
            <DescriptionSection detail={detail} />
        </>
    )
}

/** 用户评价：评价模块后端未建，先占位 */
function ReviewsSection() {
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

/** 参数信息：标签/值行列表（首条做居中摘要卡） */
function ParamsSection({ params }: { params: ProductDetail["params"] }) {
    const [head, ...rest] = params

    return (
        <DetailSection
            id="params"
            title="参数信息"
        >
            {params.length === 0 ? (
                <Empty>
                    <EmptyHeader>
                        <EmptyTitle>暂无参数</EmptyTitle>
                    </EmptyHeader>
                </Empty>
            ) : (
                <div className="space-y-4">
                    {head && (
                        <div className="rounded-xl bg-sunken/50 px-6 py-5 text-center">
                            <p className="text-lg font-bold text-foreground">{head.value}</p>
                            <p className="mt-1 text-sm text-muted-foreground">{head.name}</p>
                        </div>
                    )}
                    <dl className="space-y-3">
                        {rest.map((p) => (
                            <div
                                key={`${p.name}:${p.value}`}
                                className="flex gap-6 text-sm sm:grid sm:grid-cols-[140px_1fr] sm:gap-0"
                            >
                                <dt className="shrink-0 text-muted-foreground">{p.name}</dt>
                                <dd className="text-foreground">{p.value}</dd>
                            </div>
                        ))}
                    </dl>
                </div>
            )}
        </DetailSection>
    )
}

/** 图文详情：描述文字 + 图片纵向铺陈 */
function DescriptionSection({ detail }: { detail: ProductDetail }) {
    if (detail.description === "" && detail.images.length === 0) {
        return (
            <DetailSection
                id="detail"
                title="图文详情"
            >
                <Empty>
                    <EmptyHeader>
                        <EmptyTitle>暂无图文详情</EmptyTitle>
                        <EmptyDescription>卖家还没有上传商品图文</EmptyDescription>
                    </EmptyHeader>
                </Empty>
            </DetailSection>
        )
    }

    return (
        <DetailSection
            id="detail"
            title="图文详情"
        >
            {detail.description && (
                <p className="whitespace-pre-line text-sm leading-relaxed text-foreground/90">
                    {detail.description}
                </p>
            )}
            {detail.images.length > 0 && (
                <div className="mt-4 flex flex-col items-center gap-2">
                    {detail.images.map((img) => (
                        <img
                            key={img}
                            src={img}
                            alt="商品详情图"
                            loading="lazy"
                            className="w-full max-w-2xl rounded-lg object-contain"
                        />
                    ))}
                </div>
            )}
        </DetailSection>
    )
}
