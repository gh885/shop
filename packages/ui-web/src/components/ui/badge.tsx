import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "src/lib/utils"

const badgeVariants = cva(
    "group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-4xl border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 [&>svg]:pointer-events-none [&>svg]:size-3!",
    {
        variants: {
            variant: {
                default: "bg-secondary text-secondary-foreground [a]:hover:bg-secondary/80",
                secondary: "bg-secondary text-secondary-foreground [a]:hover:bg-secondary/80",
                destructive:
                    "bg-destructive/10 text-destructive focus-visible:ring-destructive/20 [a]:hover:bg-destructive/20",
                outline:
                    "border-border text-foreground [a]:hover:bg-muted [a]:hover:text-muted-foreground",
                ghost: "hover:bg-muted hover:text-muted-foreground",
                link: "text-link underline-offset-4 hover:underline",
                success: "bg-success-subtle text-success-subtle-foreground",
                warning: "bg-warning-subtle text-warning-subtle-foreground",
                info: "bg-info-subtle text-info-subtle-foreground",
                // DESIGN.md §色彩「每色三件套」：补齐 destructive 的 subtle 弱底档（其余三档已有，之前只有临时 bg-destructive/10）
                "destructive-subtle": "bg-destructive-subtle text-destructive-subtle-foreground",
                /** 区别于中性 outline：描边与文字都走 primary（商品卡服务/促销类标签） */
                "outline-primary": "border-primary/50 text-primary",
            },
            size: {
                default: "",
                /** 紧凑 chip 档（商品卡标签排）：方角 rounded-sm，区别于默认 20px 胶囊；DESIGN.md 圆角阶梯 sm 用途即「小徽标/chip」 */
                sm: "h-4 rounded-sm px-1 text-3xs",
            },
        },
        defaultVariants: {
            variant: "default",
            size: "default",
        },
    },
)

function Badge({
    className,
    variant = "default",
    size = "default",
    render,
    ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
    return useRender({
        defaultTagName: "span",
        props: mergeProps<"span">(
            {
                className: cn(badgeVariants({ variant, size }), className),
            },
            props,
        ),
        render,
        state: {
            slot: "badge",
            variant,
            size,
        },
    })
}

export { Badge, badgeVariants }
