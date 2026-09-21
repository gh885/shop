import * as React from "react"
import { cn } from "src/lib/utils"

/** srcset 默认生成的处理宽度档（px）。七牛 thumbnail 只缩不放，超出原图宽度的档位无害退化为原图 */
const DEFAULT_WIDTHS = [120, 240, 480, 960, 1440]

/** 组件自有形状档（DESIGN.md 圆角阶梯；no-restyle 不容许业务侧给 <Image> 叠 rounded-*） */
const RADIUS_CLASS = {
    sm: "rounded-sm",
    md: "rounded-md",
    lg: "rounded-lg",
    xl: "rounded-xl",
    full: "rounded-full",
} as const

/** 拼七牛下载处理参数；URL 已带 query 时用 & 追加 */
function withMogr2(url: string, width: number): string {
    const sep = url.includes("?") ? "&" : "?"
    return `${url}${sep}imageMogr2/thumbnail/${width}x`
}

/** http(s) 才拼 srcset（dataURL/blob 本地预览加不了查询串）；widths 为空即关闭 */
function buildSrcSet(src: string, widths: number[]): string | undefined {
    if (widths.length === 0 || !/^https?:\/\//i.test(src)) return undefined
    return widths.map((w) => `${withMogr2(src, w)} ${w}w`).join(", ")
}

/** ratio 经 --ratio 变量给 aspect-(--ratio) 占位，img 与占位共用 */
const RATIO_CLASS = "aspect-(--ratio)"

export interface ImageProps extends Omit<React.ComponentProps<"img">, "src"> {
    /** 已解析的完整 URL（imgUrl(key) 拼好后传入）；空值渲染占位，避免 img src="" 警告 */
    src?: string | null
    /** srcset 处理宽度档位；传 [] 关闭拼接（dataURL/blob 本地预览自动跳过） */
    widths?: number[]
    /** 首屏图：eager + fetchpriority=high，放弃懒加载 */
    priority?: boolean
    /** 宽高比（宽/高）占位防 CLS；固定比例也可由消费方 className 的 aspect-* 承担 */
    ratio?: number
    /** 圆角档（对应 DESIGN.md 圆角阶梯）；图片被 overflow-hidden 容器裁切时不需要传 */
    radius?: keyof typeof RADIUS_CLASS
    /** 父级带 group 时 hover 微放大（商品卡模式）；动效归组件，业务侧勿再叠 transition/scale 类 */
    hoverScale?: boolean
    /** 空 src / 加载失败的占位内容，默认「暂无图片」 */
    fallback?: React.ReactNode
}

/**
 * 图片原子：在原生 img 上统一三件事——
 * ① 空 src / 加载失败渲染占位；② 默认懒加载 + 异步解码；③ 七牛 imageMogr2 多档 srcset（仅 http(s) URL）。
 * 尺寸由消费方 className 控制；圆角与动效是组件自有皮肤（radius / hoverScale props），非业务覆盖面。
 */
function Image(props: ImageProps) {
    const { src } = props
    // 记住失败的 src：换源自动恢复，无需 effect
    const [failedSrc, setFailedSrc] = React.useState<string | undefined>(undefined)

    if (!src || failedSrc === src) return <ImageFallback {...props} />
    return (
        <ImageTag
            {...props}
            src={src}
            onFailed={() => setFailedSrc(src)}
        />
    )
}

function ImageTag({
    src,
    alt,
    widths = DEFAULT_WIDTHS,
    priority = false,
    ratio,
    radius,
    hoverScale = false,
    fallback,
    className,
    style,
    loading,
    fetchPriority,
    decoding,
    onError,
    onFailed,
    ...props
}: ImageProps & { src: string; onFailed: () => void }) {
    void fallback // 占位内容只在 ImageFallback 分支消费，这里丢弃防止漏进 img 属性
    const ratioClass = ratio === undefined ? undefined : RATIO_CLASS
    const styleProp = ratio === undefined ? style : ({ "--ratio": ratio } as React.CSSProperties)
    return (
        <img
            {...props}
            src={src}
            alt={alt}
            srcSet={buildSrcSet(src, widths)}
            loading={loading ?? (priority ? "eager" : "lazy")}
            fetchPriority={fetchPriority ?? (priority ? "high" : "auto")}
            decoding={decoding ?? "async"}
            onError={(event) => {
                onFailed()
                onError?.(event)
            }}
            className={cn(
                "object-cover",
                ratioClass,
                radius && RADIUS_CLASS[radius],
                hoverScale && "transition-transform duration-150 group-hover:scale-104",
                className,
            )}
            style={styleProp}
        />
    )
}

function ImageFallback({ alt, ratio, radius, className, style, fallback }: ImageProps) {
    const ratioClass = ratio === undefined ? undefined : RATIO_CLASS
    const styleProp = ratio === undefined ? style : ({ "--ratio": ratio } as React.CSSProperties)
    return (
        <div
            // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- 占位盒不是真 img；role+aria-label 让 AT 按图播报 alt
            role="img"
            aria-label={alt}
            className={cn(
                "flex items-center justify-center bg-muted text-xs text-muted-foreground",
                ratioClass,
                radius && RADIUS_CLASS[radius],
                className,
            )}
            style={styleProp}
        >
            {fallback ?? "暂无图片"}
        </div>
    )
}

export { Image }
