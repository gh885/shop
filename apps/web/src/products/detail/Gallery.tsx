import { useEffect, useRef, useState, type RefObject } from "react"
import {
    Button,
    Carousel,
    CarouselContent,
    CarouselItem,
    Empty,
    EmptyHeader,
    EmptyTitle,
    Image,
    Tabs,
    TabsList,
    TabsTrigger,
    Tooltip,
    TooltipContent,
    TooltipTrigger,
    cn,
    type CSSVars,
    type CarouselApi,
} from "@shop/ui-web"
import { ChevronLeft, ChevronRight, SlidersHorizontal } from "lucide-react"

import type { ParamItem } from "@shop/api/sdk"
import { scrollToElement } from "@shop/common/domain"
import { useT } from "#/locales/use-t"
import { lensGeometry, ZOOM, type LensGeometry } from "./gallery-zoom"

/**
 * 详情页左侧：缩略图列 + 主图轮播 + 底部「图集 / 参数」Tabs。
 *
 * 本质是一个 loop 轮播：slides = 商品图 + 最后一张固定的「参数」页——
 * - hover/点击缩略图（含参数项）→ scrollTo 对应 slide，hover 即预览
 * - 主图两侧圆形箭头首尾循环翻页；仅 hover 主图区域时显示
 * - hover 主图（鼠标设备）→ 指针处浮现蒙层，主图右侧同步显示蒙层圈住那块的放大图
 * - 选中态从 embla select 事件回同步，缩略图高亮与底部 Tabs 共用同一个 current
 *
 * 尺寸对齐天猫 picGallery（844×620）：缩略图列 76 + 间距 16 + 主图区 752×564（
 * 其中图 640 宽居中，两侧各 56 留给翻页箭头），下方 16px 处是 40px 高的切换条
 * （总高 564 + 16 + 40 = 620）。
 */
export function Gallery({ images, params }: { images: string[]; params: ParamItem[] }) {
    const [api, setApi] = useState<CarouselApi>()
    const [current, setCurrent] = useState(0)
    const { lensRef, previewRef, isZooming, onPointerMove, onPointerLeave } = useLensPreview()

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
    const currentImage = images[current]

    return (
        <div>
            {/* 窄屏把缩略图列落到主图下方（flex-col-reverse：DOM 里缩略图在前、主图在后，
                视觉上主图在上），lg 起恢复「左缩略图 + 右主图」的横排。
                主图框的固定高 h-141 只在 lg 起生效，窄屏改用 aspect-square，
                否则 375px 下主图约 235×564、比例极端（见 SlideFrame）。 */}
            <div className="flex flex-col-reverse gap-4 lg:flex-row">
                <ThumbnailStrip
                    images={images}
                    current={current}
                    isParams={isParams}
                    paramsIndex={paramsIndex}
                    onSelect={(index) => api?.scrollTo(index)}
                />

                <GalleryStage
                    images={images}
                    params={params}
                    current={current}
                    setApi={setApi}
                    onPrev={() => api?.scrollPrev()}
                    onNext={() => api?.scrollNext()}
                    currentImage={currentImage}
                    showZoom={!isParams && Boolean(currentImage)}
                    lensRef={lensRef}
                    previewRef={previewRef}
                    isZooming={isZooming}
                    onPointerMove={onPointerMove}
                    onPointerLeave={onPointerLeave}
                />
            </div>

            <GalleryTabs
                isParams={isParams}
                onSelect={(value) => api?.scrollTo(value === "params" ? paramsIndex : 0)}
            />
        </div>
    )
}

/** 主轮播区：loop 循环翻页 + 翻页箭头 + 放大预览浮层（loop 首尾相接，箭头仅 hover 该区域时浮现） */
/** 主轮播区的入参：数据 + 翻页回调 + 放大预览接线 */
type GalleryStageProps = {
    images: string[]
    params: ParamItem[]
    current: number
    setApi: (api: CarouselApi) => void
    onPrev: () => void
    onNext: () => void
    /** 当前主图（参数页时 undefined） */
    currentImage: string | undefined
    /** 放大预览该不该在场（参数页没有可放大的图） */
    showZoom: boolean
} & LensPreviewProps

/** 放大预览的接线（useLensPreview 的返回值）：蒙层/预览两个 ref + 开关 + 指针回调 */
type LensPreviewProps = {
    lensRef: RefObject<HTMLDivElement | null>
    previewRef: RefObject<HTMLDivElement | null>
    isZooming: boolean
    onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => void
    onPointerLeave: () => void
}

function GalleryStage({
    images,
    params,
    current,
    setApi,
    onPrev,
    onNext,
    currentImage,
    showZoom,
    lensRef,
    previewRef,
    isZooming,
    onPointerMove,
    onPointerLeave,
}: GalleryStageProps) {
    return (
        <div className="group relative min-w-0 flex-1">
            {/* gutter="lg"（3.5rem）= 箭头的地盘：图片因此比主图区窄，箭头站在图外 */}
            <Carousel
                setApi={setApi}
                opts={{ loop: true }}
                className="w-full"
                gutter="lg"
            >
                <CarouselContent>
                    <GallerySlides
                        images={images}
                        params={params}
                        current={current}
                        lensRef={lensRef}
                        isZooming={isZooming}
                        onPointerMove={onPointerMove}
                        onPointerLeave={onPointerLeave}
                    />
                </CarouselContent>

                {images.length > 0 && (
                    <CarouselArrows
                        onPrev={onPrev}
                        onNext={onNext}
                    />
                )}
            </Carousel>

            {/* 放大预览：贴在主图右侧（天猫/淘宝同款），盖住右栏购买区但仍在版心内。
                预览层常驻挂载、只切显隐：这样 pointermove 能直接写它的样式 */}
            {showZoom && currentImage && (
                <ZoomPreview
                    image={currentImage}
                    previewRef={previewRef}
                    isZooming={isZooming}
                />
            )}
        </div>
    )
}

/** 轮播内容：商品图们 + 末尾固定一张「参数」页 */
function GallerySlides({
    images,
    params,
    current,
    lensRef,
    isZooming,
    onPointerMove,
    onPointerLeave,
}: {
    images: string[]
    params: ParamItem[]
    current: number
} & Pick<LensPreviewProps, "lensRef" | "isZooming" | "onPointerMove" | "onPointerLeave">) {
    return (
        <>
            {images.map((img, i) => (
                <CarouselItem key={img}>
                    <SlideFrame
                        src={img}
                        active={i === current}
                        lensRef={lensRef}
                        isZooming={isZooming}
                        onPointerMove={onPointerMove}
                        onPointerLeave={onPointerLeave}
                    />
                </CarouselItem>
            ))}
            {/* 参数 slide：行列表 + 「全部参数」弹层入口 */}
            <CarouselItem>
                <ParamsSlide params={params} />
            </CarouselItem>
        </>
    )
}

/** 底部「图集 / 参数」受控 Tabs：与轮播当前 slide 双向同步（对齐天猫 40px 高切换条） */
function GalleryTabs({
    isParams,
    onSelect,
}: {
    isParams: boolean
    onSelect: (value: string) => void
}) {
    const t = useT("product")
    return (
        <Tabs
            value={isParams ? "params" : "gallery"}
            onValueChange={onSelect}
            className="mt-4"
        >
            <TabsList className="mx-auto min-h-10">
                <TabsTrigger
                    value="gallery"
                    size="lg"
                >
                    {t("product.detail.gallery.tab")}
                </TabsTrigger>
                <TabsTrigger
                    value="params"
                    size="lg"
                >
                    {t("product.detail.params.tab")}
                </TabsTrigger>
            </TabsList>
        </Tabs>
    )
}

/**
 * 放大预览的接线：开关进 state（只在进入/离开时变），蒙层/放大区直接写 DOM。
 *
 * pointermove 每秒几十次，走 state 会把整个轮播跟着重渲染，而这里只需要换两个样式属性。
 */
function useLensPreview(): LensPreviewProps {
    const previewRef = useRef<HTMLDivElement>(null)
    const lensRef = useRef<HTMLDivElement>(null)
    const [isZooming, setIsZooming] = useState(false)

    /** 指针在图片框内移动 → 算几何（纯函数在 ./gallery-zoom）→ 写蒙层与预览的样式 */
    const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
        // 触屏没有 hover 语义，只在鼠标指针下开预览
        if (event.pointerType !== "mouse") return
        const frame = event.currentTarget.getBoundingClientRect()
        const geom = lensGeometry({
            naturalAspect: naturalAspectOf(frame, event.currentTarget.firstElementChild),
            frameWidth: frame.width,
            frameHeight: frame.height,
            pointerX: (event.clientX - frame.left) / frame.width,
            pointerY: (event.clientY - frame.top) / frame.height,
        })
        writeLensStyles(lensRef.current, previewRef.current, geom)
        setIsZooming(true)
    }

    return {
        previewRef,
        lensRef,
        isZooming,
        onPointerMove,
        onPointerLeave: () => setIsZooming(false),
    }
}

/**
 * 原图宽高比：object-cover 会按原图比例裁切，裁掉的量要从坐标里扣掉——
 * 取不到 naturalWidth（图片还没解码）时用框的比例兜底。
 * 这套几何连同它的兜底都在 ./gallery-zoom 里（可单测）。
 */
function naturalAspectOf(frame: DOMRect, first: Element | null): number {
    const el = first instanceof HTMLImageElement ? first : undefined
    return el?.naturalWidth ? el.naturalWidth / el.naturalHeight : frame.width / frame.height
}

/** 把算好的几何写进 DOM（不进 state：pointermove 每秒几十次，走 state 会把轮播全量重渲染）。 */
function writeLensStyles(
    lens: HTMLDivElement | null,
    preview: HTMLDivElement | null,
    geom: LensGeometry,
) {
    if (lens) {
        lens.style.left = `${geom.fx * 100}%`
        lens.style.top = `${geom.fy * 100}%`
        lens.style.width = `${geom.lensX * 100}%`
        lens.style.height = `${geom.lensY * 100}%`
    }
    if (preview) {
        preview.style.backgroundPosition = geom.backgroundPosition
    }
}

/** 竖排缩略图列：图片们 + 固定最后的「参数」项，hover 即切换；超出主图区高度时内部滚动 */
function ThumbnailStrip({
    images,
    current,
    isParams,
    paramsIndex,
    onSelect,
}: {
    images: string[]
    current: number
    isParams: boolean
    paramsIndex: number
    onSelect: (index: number) => void
}) {
    const t = useT("product")
    return (
        // 窄屏横排（缩略图在主图下方，横向滚动）；lg 起竖排（w-19 = 76px 一列，超主图区高度时内部滚动）。
        // 每格在窄屏定宽 w-14、lg 起 w-full，避免横排时按钮宽度由图片固有尺寸反向撑开。
        <div className="flex w-full shrink-0 gap-2 overflow-x-auto lg:w-19 lg:flex-col lg:overflow-y-auto">
            {images.map((img, i) => (
                <button
                    key={img}
                    type="button"
                    onMouseEnter={() => onSelect(i)}
                    onClick={() => onSelect(i)}
                    aria-label={t("product.detail.image.thumbnailAria", { index: i + 1 })}
                    aria-pressed={i === current && !isParams}
                    className={cn(
                        "w-14 shrink-0 overflow-hidden rounded-lg border-2 transition-colors lg:w-full",
                        i === current && !isParams ? "border-primary" : "border-transparent",
                    )}
                >
                    <Image
                        src={img}
                        alt=""
                        className="aspect-square w-full"
                    />
                </button>
            ))}
            {/* 参数项：固定最后，hover/点击切换，选中态强调描边 */}
            <button
                type="button"
                onMouseEnter={() => onSelect(paramsIndex)}
                onClick={() => onSelect(paramsIndex)}
                aria-label={t("product.detail.params.triggerAria")}
                className={cn(
                    "flex aspect-square w-14 shrink-0 flex-col items-center justify-center gap-1 rounded-lg border-2 transition-colors lg:w-full",
                    isParams
                        ? "border-primary bg-accent text-accent-foreground"
                        : "border-border bg-sunken/60 text-muted-foreground hover:text-primary",
                )}
            >
                <SlidersHorizontal className="size-4" />
                <span className="text-xs">{t("product.detail.params.tab")}</span>
            </button>
        </div>
    )
}

/** 单张主图框：图片 + 放大蒙层（蒙层只在当前 slide 挂载，坐标就是框内百分比） */
function SlideFrame({
    src,
    active,
    lensRef,
    isZooming,
    onPointerMove,
    onPointerLeave,
}: { src: string; active: boolean } & Pick<
    LensPreviewProps,
    "lensRef" | "isZooming" | "onPointerMove" | "onPointerLeave"
>) {
    const t = useT("product")
    return (
        // hover 事件挂在图片框上（不是整个主图区）：箭头所在的留白不算「图片」
        <div
            className="relative flex aspect-square items-center justify-center lg:aspect-auto lg:h-141"
            onPointerMove={onPointerMove}
            onPointerLeave={onPointerLeave}
        >
            <Image
                src={src}
                alt={t("product.detail.image.mainAlt")}
                priority
                radius="xl"
                className="size-full"
            />
            {active && (
                <div
                    ref={lensRef}
                    aria-hidden
                    className={cn(
                        "pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 bg-background/50 transition-opacity duration-150",
                        isZooming ? "opacity-100" : "opacity-0",
                    )}
                />
            )}
        </div>
    )
}

/** 圆形翻页箭头：loop 首尾相接（第一张点左箭头翻到最后的参数页）；hover 区域才显示。
 * 垂直居中用 inset-y-0 + my-auto，不能用 -translate-y-1/2：
 * Button 基础样式带 active:translate-y-px，会盖掉 -translate-y-1/2，
 * 按下瞬间按钮下跳半个高度、指针落空 → 点击不触发（连点没反应）。 */
function CarouselArrows({ onPrev, onNext }: { onPrev: () => void; onNext: () => void }) {
    const t = useT("product")
    return (
        <>
            <Tooltip>
                <TooltipTrigger
                    render={
                        <Button
                            variant="overlay"
                            shape="pill"
                            size="icon-lg"
                            aria-label={t("product.detail.carousel.prev")}
                            onClick={onPrev}
                            className="absolute inset-y-0 left-0 z-10 my-auto size-10"
                        >
                            <ChevronLeft className="size-5" />
                        </Button>
                    }
                />
                <TooltipContent>{t("product.detail.carousel.prev")}</TooltipContent>
            </Tooltip>
            <Tooltip>
                <TooltipTrigger
                    render={
                        <Button
                            variant="overlay"
                            shape="pill"
                            size="icon-lg"
                            aria-label={t("product.detail.carousel.next")}
                            onClick={onNext}
                            className="absolute inset-y-0 right-0 z-10 my-auto size-10"
                        >
                            <ChevronRight className="size-5" />
                        </Button>
                    }
                />
                <TooltipContent>{t("product.detail.carousel.next")}</TooltipContent>
            </Tooltip>
        </>
    )
}

/** 放大预览浮层：贴在主图右侧（盖住右栏购买区但仍在版心内）。
 * pointer-events-none：它只是一张「画」，指针始终属于主图——
 * 否则鼠标往右去点「加入购物车」会先被它挡住，预览反而不肯关。 */
function ZoomPreview({
    image,
    previewRef,
    isZooming,
}: { image: string } & Pick<LensPreviewProps, "previewRef" | "isZooming">) {
    const zoomStyle: CSSVars = {
        "--zoom-image": `url(${image})`,
        "--zoom-size": `${ZOOM * 100}%`,
    }
    return (
        <div
            ref={previewRef}
            aria-hidden
            className={cn(
                "pointer-events-none absolute top-0 left-full z-sticky ml-4 hidden size-141 rounded-lg border border-border bg-background bg-(image:--zoom-image) bg-size-(--zoom-size) bg-no-repeat shadow-lg transition-opacity duration-150 lg:block",
                isZooming ? "opacity-100" : "opacity-0",
            )}
            style={zoomStyle}
        />
    )
}

/** 参数 slide：参数行列表 + 底部「全部参数」弹层入口 */
function ParamsSlide({ params }: { params: ParamItem[] }) {
    const t = useT("product")
    if (params.length === 0) {
        return (
            <Empty className="aspect-square lg:aspect-auto lg:h-141">
                <EmptyHeader>
                    <EmptyTitle>{t("product.detail.params.empty")}</EmptyTitle>
                </EmptyHeader>
            </Empty>
        )
    }

    return (
        <div className="flex aspect-square flex-col rounded-lg bg-background p-6 ring-1 ring-border/60 lg:aspect-auto lg:h-141">
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
                <Button
                    type="button"
                    variant="outline"
                    shape="pill"
                    onClick={() => scrollToElement("params")}
                >
                    {t("product.detail.params.viewAll")}
                    <ChevronRight
                        className="size-4"
                        data-icon="inline-end"
                    />
                </Button>
            </div>
        </div>
    )
}
