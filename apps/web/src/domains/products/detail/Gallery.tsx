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

export function Gallery({ images, params }: { images: string[]; params: ParamItem[] }) {
    const [api, setApi] = useState<CarouselApi>()
    const [current, setCurrent] = useState(0)
    const { lensRef, previewRef, isZooming, onPointerMove, onPointerLeave } = useLensPreview()

    const paramsIndex = images.length

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

type GalleryStageProps = {
    images: string[]
    params: ParamItem[]
    current: number
    setApi: (api: CarouselApi) => void
    onPrev: () => void
    onNext: () => void
    currentImage: string | undefined
    showZoom: boolean
} & LensPreviewProps

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
            <CarouselItem>
                <ParamsSlide params={params} />
            </CarouselItem>
        </>
    )
}

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

function useLensPreview(): LensPreviewProps {
    const previewRef = useRef<HTMLDivElement>(null)
    const lensRef = useRef<HTMLDivElement>(null)
    const [isZooming, setIsZooming] = useState(false)

    const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
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

function naturalAspectOf(frame: DOMRect, first: Element | null): number {
    const el = first instanceof HTMLImageElement ? first : undefined
    return el?.naturalWidth ? el.naturalWidth / el.naturalHeight : frame.width / frame.height
}

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
