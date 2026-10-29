import { useEffect, useState, type ReactNode } from "react"

import {
    Tabs,
    TabsList,
    TabsTrigger,
    Empty,
    EmptyDescription,
    EmptyHeader,
    EmptyTitle,
    Card,
    CardContent,
    Skeleton,
    Image,
} from "@shop/ui-web"

import { scrollToElement } from "@shop/common/domain"
import { useT } from "#/locales/use-t"

import { toProductCardData } from "../display"
import type { Product, ProductDetail } from "../rules"
import { imgUrl } from "#/shared/lib/image"
import { useSuspenseQuery } from "@tanstack/react-query"
import { QueryBoundary } from "@shop/app-kit/data"
import { ProductCard } from "../ProductCard"
import { alsoViewedOptions } from "./queries"
import { DETAIL_SECTIONS } from "./constants"

function DetailSection({
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
            variant="plain"
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

function recoGridClass(className: string): string {
    return `-mx-4 grid gap-4 ${className}`
}

function RecoGridSkeleton({ className }: { className: string }) {
    return (
        <div
            className={recoGridClass(className)}
            aria-hidden
        >
            {Array.from({ length: 8 }, (_, i) => (
                <Skeleton
                    key={i}
                    className="aspect-5/7 w-full rounded-lg"
                />
            ))}
        </div>
    )
}

function RecoGrid({
    products,
    currentId,
    className,
}: {
    products: Product[]
    currentId: string
    className: string
}) {
    const t = useT()
    const list = products.filter((p) => p.spuId !== currentId)

    return (
        <div className={recoGridClass(className)}>
            {list.map((product) => (
                <ProductCard
                    key={product.spuId}
                    product={toProductCardData(product)}
                />
            ))}
            {list.length === 0 && (
                <Empty className="col-span-full py-6">
                    <EmptyHeader>
                        <EmptyTitle>{t("product.detail.reco.empty")}</EmptyTitle>
                    </EmptyHeader>
                </Empty>
            )}
        </div>
    )
}

export function DetailSections({ detail }: { detail: ProductDetail }) {
    const t = useT()
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
            <div className="sticky top-0 z-sticky bg-canvas pt-4 pb-3">
                <Tabs
                    value={active}
                    onValueChange={(value) => {
                        scrollToElement(value)
                    }}
                >
                    <TabsList
                        variant="line"
                        className="min-h-12"
                    >
                        {DETAIL_SECTIONS.map((s) => (
                            <TabsTrigger
                                key={s.id}
                                value={s.id}
                                size="lg"
                            >
                                {t(s.labelKey)}
                            </TabsTrigger>
                        ))}
                    </TabsList>
                </Tabs>
            </div>

            <ParamsSection params={detail.attributes} />
            <DescriptionSection detail={detail} />
        </>
    )
}

function ParamsSection({ params }: { params: ProductDetail["attributes"] }) {
    const t = useT()
    const [head, ...rest] = params

    return (
        <DetailSection
            id="params"
            title={t("product.detail.section.params")}
        >
            {params.length === 0 ? (
                <Empty>
                    <EmptyHeader>
                        <EmptyTitle>{t("product.detail.params.empty")}</EmptyTitle>
                    </EmptyHeader>
                </Empty>
            ) : (
                <div className="space-y-4">
                    {head && (
                        <div className="rounded-lg bg-background px-6 py-5 text-center ring-1 ring-border/60">
                            <p className="text-lg font-bold text-foreground">{head.value}</p>
                            <p className="mt-1 text-sm text-muted-foreground">{head.code}</p>
                        </div>
                    )}
                    <dl className="space-y-3">
                        {rest.map((p) => (
                            <div
                                key={`${p.code}:${p.value}`}
                                className="flex gap-6 text-sm sm:gap-0"
                            >
                                <dt className="shrink-0 text-muted-foreground sm:w-35">{p.code}</dt>
                                <dd className="min-w-0 wrap-break-word text-foreground sm:flex-1">
                                    {p.value}
                                </dd>
                            </div>
                        ))}
                    </dl>
                </div>
            )}
        </DetailSection>
    )
}

function DescriptionSection({ detail }: { detail: ProductDetail }) {
    const t = useT()
    if (detail.detailImages.length === 0) {
        return (
            <DetailSection
                id="detail"
                title={t("product.detail.section.detail")}
            >
                <Empty>
                    <EmptyHeader>
                        <EmptyTitle>{t("product.detail.description.empty")}</EmptyTitle>
                        <EmptyDescription>
                            {t("product.detail.description.emptyHint")}
                        </EmptyDescription>
                    </EmptyHeader>
                </Empty>
            </DetailSection>
        )
    }

    return (
        <DetailSection
            id="detail"
            title={t("product.detail.section.detail")}
        >
            <div className="flex flex-col items-center gap-2">
                {detail.detailImages.map((img) => (
                    <Image
                        key={img}
                        src={imgUrl(img)}
                        alt={t("product.detail.imageAlt")}
                        radius="lg"
                        className="w-full max-w-2xl object-contain"
                    />
                ))}
            </div>
        </DetailSection>
    )
}

function AlsoViewedGrid({ currentId }: { currentId: string }) {
    const data = useSuspenseQuery(alsoViewedOptions).data
    return (
        <RecoGrid
            products={data}
            currentId={currentId}
            className="grid-cols-6"
        />
    )
}

export function AlsoViewedSection({ detail }: { detail: ProductDetail }) {
    const t = useT()
    return (
        <DetailSection
            id="also-viewed"
            title={t("product.detail.section.alsoViewed")}
        >
            <QueryBoundary
                pending={<RecoGridSkeleton className="grid-cols-6" />}
                fallback={t("common.loadFailed.recommend")}
            >
                <AlsoViewedGrid currentId={detail.spuId} />
            </QueryBoundary>
        </DetailSection>
    )
}
