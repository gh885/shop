import { useId, type CSSProperties } from "react"

import { cn } from "src/lib/utils"

/**
 * Logo 设计说明
 *
 * 图形标：圆角方块（rx≈27%，呼应全站偏大圆角）+ 白色店面遮阳篷（awning）。
 * 纯几何构成：顶梁、三连半圆波浪、店身、门洞镂空。无渐变、无描边，
 * 16px favicon 下依然可辨。
 *
 * 颜色：brand 变体图形标消费语义 token --color-primary（品牌橙，取值见 styles.css 的 orange-600），
 * admin 端把 primary 重映射为 indigo 即可零改动换身份色；
 * 字标走 currentColor，跟随上下文 text-*。
 *
 * 组合规范：图形标与字标间距 = 0.35em。字标为艺术字处理：
 * 超粗黑体（font-black）+ 斜切（italic + 轻 skew）+ 负字距，
 * 消费级电商字标的经典手法（京东/淘宝同款思路）；brand 变体字标用品牌橙。
 * 最小尺寸：图形标 16px；带字标组合 20px。
 */

type LogoVariant = "brand" | "mono"

interface LogoMarkProps extends React.SVGAttributes<SVGSVGElement> {
    /** 边长（px），图形标恒为正方形 */
    size?: number
    /**
     * brand：橙底白图形（不透明，可压在图片/任意背景上）
     * mono：单色 currentColor，图形镂空透出背景，用于页脚/水印/单色印刷场景
     */
    variant?: LogoVariant
}

export function LogoMark({ size = 32, variant = "brand", className, ...props }: LogoMarkProps) {
    const maskId = useId()
    const mono = variant === "mono"

    const glyph = (
        <>
            {/* 顶梁 */}
            <path d="M11 11.5h26a2 2 0 0 1 2 2V15H9v-1.5a2 2 0 0 1 2-2Z" />
            {/* 三连半圆波浪 */}
            <path d="M9 15h30v3.5a5 5 0 0 1-10 0 5 5 0 0 1-10 0 5 5 0 0 1-10 0Z" />
            {/* 店身 + 门洞镂空 */}
            <path
                fillRule="evenodd"
                d="M13 24.5h22a2 2 0 0 1 2 2V36a2 2 0 0 1-2 2H13a2 2 0 0 1-2-2v-9.5a2 2 0 0 1 2-2ZM21 38v-8a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v8Z"
            />
        </>
    )

    return (
        <svg
            viewBox="0 0 48 48"
            width={size}
            height={size}
            // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- SVG 无语义等价标签，role=img 是 WAI-ARIA 的规范用法
            role="img"
            aria-label="Shop logo"
            className={cn("shrink-0", className)}
            {...props}
        >
            {mono ? (
                <>
                    {/* mask 里的 fill 不是品牌色，是遮罩亮度：白 = 保留，黑 = 挖掉。
                        所以不能跟着 currentColor 走，只能显式取主题里的绝对白/黑 */}
                    <mask id={maskId}>
                        <rect
                            width="48"
                            height="48"
                            rx="13"
                            fill="var(--color-white)"
                        />
                        <g fill="var(--color-black)">{glyph}</g>
                    </mask>
                    <rect
                        width="48"
                        height="48"
                        rx="13"
                        fill="currentColor"
                        mask={`url(#${maskId})`}
                    />
                </>
            ) : (
                <>
                    <rect
                        width="48"
                        height="48"
                        rx="13"
                        className="fill-primary"
                    />
                    <g className="fill-primary-foreground">{glyph}</g>
                </>
            )}
        </svg>
    )
}

interface LogoProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, "children"> {
    /** 图形标边长（px），字标字号随动 */
    size?: number
    variant?: LogoVariant
    /** 是否带字标（登录页/加载页可只用图形标） */
    wordmark?: boolean
    /** 字标文字，默认“有店”；品牌定名后改这里一处即可 */
    name?: string
}

export function Logo({
    size = 24,
    variant = "brand",
    wordmark = true,
    name = "有店",
    className,
    ...props
}: LogoProps) {
    return (
        <span
            className={cn(
                "inline-flex items-center gap-[0.35em] text-(length:--logo-font-size)",
                variant === "mono" ? "text-current" : "text-primary",
                className,
            )}
            // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- CSS 变量键不在 CSSProperties 内，断言是仓库既有写法
            style={{ "--logo-font-size": `${size * 0.72}px` } as CSSProperties}
            {...props}
        >
            <LogoMark
                size={size}
                variant={variant}
                aria-hidden={wordmark}
            />
            {wordmark && (
                <span className="-skew-x-3 font-black italic leading-none tracking-tighter">
                    {name}
                </span>
            )}
        </span>
    )
}
