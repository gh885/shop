import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "src/lib/utils"

const buttonVariants = cva(
    "group/button inline-flex shrink-0 items-center justify-center rounded-md border border-transparent bg-clip-padding text-sm font-semibold whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
    {
        variants: {
            variant: {
                default:
                    "bg-primary text-primary-foreground hover:bg-primary-hover active:bg-primary-active",
                outline:
                    "border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground",
                secondary:
                    "bg-secondary text-secondary-foreground hover:bg-secondary-hover aria-expanded:bg-secondary-hover aria-expanded:text-secondary-foreground",
                ghost: "hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground",
                destructive:
                    "bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20",
                link: "text-link underline-offset-4 hover:underline",
                cta: "rounded-lg bg-primary text-base text-primary-foreground hover:bg-primary-hover active:bg-primary-active",
                "cta-alt":
                    "rounded-lg bg-linear-to-r from-cta-alt to-cta-alt-hover text-base text-cta-alt-foreground hover:from-cta-alt-hover hover:to-cta-alt-active active:from-cta-alt-active",
                /** 图片/媒体上的悬停浮现圆钮（详情页翻页、放大会用到）。
                    依赖祖先有 `group`；圆角由 shape="pill" 提供。
                    focus-within / focus-visible 两档不可省：只有 group-hover 时，键盘 Tab 过来
                    焦点落在一枚 opacity-0 的钮上，焦点环跟着透明度一起被吃掉。 */
                overlay:
                    "bg-background/90 shadow-sm backdrop-blur transition-opacity duration-200 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 hover:text-primary",
            },
            size: {
                default:
                    "h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
                xs: "h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
                sm: "h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
                lg: "h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
                icon: "size-8",
                "icon-xs":
                    "size-6 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
                "icon-sm":
                    "size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg",
                "icon-lg": "size-9",
            },
            /** 形状：pill = 胶囊。默认圆角来自基类的 rounded-md（cta/cta-alt 另烘 rounded-lg） */
            shape: {
                default: "",
                pill: "rounded-full",
            },
        },
        defaultVariants: {
            variant: "default",
            size: "default",
            shape: "default",
        },
    },
)

function Button({
    className,
    variant = "default",
    size = "default",
    shape = "default",
    ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
    return (
        <ButtonPrimitive
            data-slot="button"
            // data-brand-cta：品牌实色底按钮的 a11y 豁免标记——主色 #FF5000 白字 3.28:1
            // 是 2026-10 显式产品决策（观感对等淘宝），
            // e2e/i18n/a11y.spec.ts 按此标记豁免；非实色底变体不标记、照常全量拦截。
            data-brand-cta={variant === "default" || variant === "cta" ? "" : undefined}
            className={cn(buttonVariants({ variant, size, shape, className }))}
            {...props}
        />
    )
}

export { Button, buttonVariants }
