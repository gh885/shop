import { useEffect, useState } from "react"
import type { CarouselApi } from "@shop/ui-web"
import {
    Carousel,
    CarouselContent,
    CarouselItem,
    Empty,
    EmptyHeader,
    EmptyTitle,
    Tabs,
    TabsList,
    TabsTrigger,
} from "@shop/ui-web"
import { ChevronLeft, ChevronRight, SlidersHorizontal } from "lucide-react"

import type { ParamItem } from "#/entities/product"

/**
 * 详情页左侧：缩略图列 + 主图轮播 + 底部「图集 / 参数」Tabs。
 *
 * 本质是一个 loop 轮播：slides = 商品图 + 最后一张固定的「参数」页——
 * - hover/点击缩略图（含参数项）→ scrollTo 对应 slide，hover 即预览
 * - 主图两侧圆形箭头首尾循环翻页；仅 hover 主图区域时显示
 * - 选中态从 embla select 事件回同步，缩略图高亮与底部 Tabs 共用同一个 current
 */
export function Gallery({ images, params }: { images: string[]; params: ParamItem[] }) {
    const [api, setApi] = useState<CarouselApi>()
    const [current, setCurrent] = useState(0)

    const paramsIndex = images.length // 「参数」是最后一张 slide

    // embla 选中索引 → current（驱动缩略图高亮与底部 Tabs）
    useEffect(() => {
        if (!api) return
        const onChange = () => setCurrent(api.selectedScrollSnap())
        api.on("select", onChange)
        return () => {
            api.off("select", onChange)
        }
    }, [api])

    const isParams = current === paramsIndex

    return (
        <div>
            <div className="flex gap-3">
                {/* 竖排缩略图列：图片们 + 固定最后的「参数」项，hover 即切换 */}
                <div className="flex w-16 shrink-0 flex-col gap-2">
                    {images.map((img, i) => (
                        <button
                            key={img}
                            type="button"
                            onMouseEnter={() => api?.scrollTo(i)}
                            onClick={() => api?.scrollTo(i)}
                            aria-label={`第 ${i + 1} 张图`}
                            className={`overflow-hidden rounded-lg border-2 transition-colors ${
                                i === current && !isParams ? "border-primary" : "border-transparent"
                            }`}
                        >
                            <img
                                src={img}
                                alt=""
                                className="aspect-square w-full object-cover"
                            />
                        </button>
                    ))}
                    {/* 参数项：固定最后，hover/点击切换，选中态橙色描边 */}
                    <button
                        type="button"
                        onMouseEnter={() => api?.scrollTo(paramsIndex)}
                        onClick={() => api?.scrollTo(paramsIndex)}
                        aria-label="查看商品参数"
                        className={`flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border-2 transition-colors ${
                            isParams
                                ? "border-primary bg-primary/5 text-primary"
                                : "border-border bg-sunken/60 text-muted-foreground hover:text-primary"
                        }`}
                    >
                        <SlidersHorizontal className="size-4" />
                        <span className="text-xs">参数</span>
                    </button>
                </div>

                {/* 主轮播区：loop 循环翻页；箭头仅 hover 该区域时浮现 */}
                <div className="group relative min-w-0 flex-1">
                    <Carousel
                        setApi={setApi}
                        opts={{ loop: true }}
                        className="w-full"
                    >
                        <CarouselContent>
                            {images.map((img) => (
                                <CarouselItem key={img}>
                                    <div className="flex h-[480px] items-center justify-center">
                                        <img
                                            src={img}
                                            alt="商品主图"
                                            className="max-h-full max-w-full rounded-xl object-contain"
                                        />
                                    </div>
                                </CarouselItem>
                            ))}
                            {/* 参数 slide：行列表 + 「全部参数」弹层入口 */}
                            <CarouselItem>
                                <ParamsSlide params={params} />
                            </CarouselItem>
                        </CarouselContent>

                        {/* 圆形翻页箭头：loop 首尾相接（第一张点左箭头翻到最后的参数页）；hover 区域才显示 */}
                        {images.length > 0 && (
                            <>
                                <button
                                    type="button"
                                    aria-label="上一张"
                                    onClick={() => api?.scrollPrev()}
                                    className="absolute top-1/2 left-2 z-10 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-background/90 shadow-sm opacity-0 backdrop-blur transition-opacity duration-200 group-hover:opacity-100 hover:text-primary"
                                >
                                    <ChevronLeft className="size-5" />
                                </button>
                                <button
                                    type="button"
                                    aria-label="下一张"
                                    onClick={() => api?.scrollNext()}
                                    className="absolute top-1/2 right-2 z-10 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-background/90 shadow-sm opacity-0 backdrop-blur transition-opacity duration-200 group-hover:opacity-100 hover:text-primary"
                                >
                                    <ChevronRight className="size-5" />
                                </button>
                            </>
                        )}
                    </Carousel>
                </div>
            </div>

            {/* 底部「图集 / 参数」受控 Tabs：与轮播当前 slide 双向同步 */}
            <Tabs
                value={isParams ? "params" : "gallery"}
                onValueChange={(value) => api?.scrollTo(value === "params" ? paramsIndex : 0)}
                className="mt-4"
            >
                <TabsList className="mx-auto">
                    <TabsTrigger
                        value="gallery"
                        className="px-6"
                    >
                        图集
                    </TabsTrigger>
                    <TabsTrigger
                        value="params"
                        className="px-6"
                    >
                        参数
                    </TabsTrigger>
                </TabsList>
            </Tabs>
        </div>
    )
}

/** 参数 slide：参数行列表 + 底部「全部参数」弹层入口 */
function ParamsSlide({ params }: { params: ParamItem[] }) {
    if (params.length === 0) {
        return (
            <Empty className="h-[480px]">
                <EmptyHeader>
                    <EmptyTitle>暂无参数</EmptyTitle>
                </EmptyHeader>
            </Empty>
        )
    }

    return (
        <div className="flex h-[480px] flex-col rounded-xl bg-sunken/50 p-6">
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-2">
                {params.map((p) => (
                    <div
                        key={`${p.name}:${p.value}`}
                        className="flex text-sm"
                    >
                        <span className="w-28 shrink-0 text-muted-foreground">{p.name}</span>
                        <span className="text-foreground">{p.value}</span>
                    </div>
                ))}
            </div>

            <div className="mt-4 flex justify-center">
                {/* 全部参数：滚动到左栏「参数信息」区块（锚点由 DetailSection 提供） */}
                <button
                    type="button"
                    onClick={() =>
                        document
                            .getElementById("params")
                            ?.scrollIntoView({ behavior: "smooth", block: "start" })
                    }
                    className="flex items-center gap-1 rounded-full border border-border bg-background px-5 py-2 text-sm font-medium text-foreground transition-colors hover:border-primary/50 hover:text-primary"
                >
                    全部参数
                    <ChevronRight className="size-4" />
                </button>
            </div>
        </div>
    )
}
