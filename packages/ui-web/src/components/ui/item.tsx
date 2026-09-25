import * as React from "react"
import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "src/lib/utils"
import { Separator } from "src/components/ui/separator"

function ItemGroup({ className, ...props }: React.ComponentProps<"div">) {
    return (
        <div
            data-slot="item-group"
            className={cn(
                "group/item-group flex w-full flex-col gap-4 has-data-[size=sm]:gap-2.5 has-data-[size=xs]:gap-2",
                className,
            )}
            {...props}
        />
    )
}

function ItemSeparator({ className, ...props }: React.ComponentProps<typeof Separator>) {
    return (
        <Separator
            data-slot="item-separator"
            orientation="horizontal"
            className={cn("my-2", className)}
            {...props}
        />
    )
}

/**
 * 行皮肤。`variant` 里有两类：**容器外观**（default/outline/muted）与
 * **可选项行的选中状态**（selected/selectable）——后者是 DESIGN.md「选中态用 `accent`」
 * 的直接落地，三处单选行（优惠券/售后类型/收货地址）共用同一配方，别再手写 `bg-accent`。
 */
const itemVariants = cva(
    "group/item flex w-full flex-wrap items-center rounded-lg border text-sm transition-colors duration-100 outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 data-disabled:opacity-50 [a]:transition-colors [a]:hover:bg-muted",
    {
        variants: {
            variant: {
                default: "border-transparent",
                outline: "border-border",
                muted: "border-transparent bg-muted/50",
                /** 可选项：选中 —— accent 底 + foreground 描边（primary 只留给转化引导） */
                selected: "border-foreground bg-accent",
                /** 可选项：未选中 —— outline + 悬停反馈（这些行是 div，基类的 hover 只作用于 [a]） */
                selectable: "border-border hover:bg-muted/40",
                /** 满宽列表行：无圆角，分隔线交给父容器（Panel/divide-y）画 */
                plain: "rounded-none border-transparent",
            },
            size: {
                default: "gap-2.5 px-3 py-2.5",
                sm: "gap-2.5 px-3 py-2.5",
                xs: "gap-2 px-2.5 py-2 in-data-[slot=dropdown-menu-content]:p-0",
                /** 宽松档：面板/卡片里的列表行，水平内边距与 PanelHeader 的 px-5 对齐 */
                lg: "gap-3 px-5 py-4",
            },
        },
        defaultVariants: {
            variant: "default",
            size: "default",
        },
    },
)

function Item({
    className,
    variant = "default",
    size = "default",
    render,
    ...props
}: useRender.ComponentProps<"div"> & VariantProps<typeof itemVariants>) {
    return useRender({
        defaultTagName: variant === "selected" || variant === "selectable" ? "label" : "div",
        props: mergeProps<"div">(
            {
                className: cn(itemVariants({ variant, size, className })),
            },
            props,
        ),
        render,
        state: {
            slot: "item",
            variant,
            size,
        },
    })
}

const itemMediaVariants = cva(
    "flex shrink-0 items-center justify-center gap-2 group-has-data-[slot=item-description]/item:translate-y-0.5 group-has-data-[slot=item-description]/item:self-start [&_svg]:pointer-events-none",
    {
        variants: {
            variant: {
                default: "bg-transparent",
                icon: "[&_svg:not([class*='size-'])]:size-4",
                image: "size-10 overflow-hidden rounded-sm group-data-[size=sm]/item:size-8 group-data-[size=xs]/item:size-6 [&_img]:size-full [&_img]:object-cover",
                /** 商品缩略图：比 `image` 大一档的方图，配 `bg-muted` 占位底（图未到位时不留白洞）；
                    需要更宽的行（购物车）在调用处用 `size-*` 覆盖尺寸即可 */
                thumbnail:
                    "size-16 overflow-hidden rounded-md bg-muted [&_img]:size-full [&_img]:object-cover",
            },
        },
        defaultVariants: {
            variant: "default",
        },
    },
)

function ItemMedia({
    className,
    variant = "default",
    ...props
}: React.ComponentProps<"div"> & VariantProps<typeof itemMediaVariants>) {
    return (
        <div
            data-slot="item-media"
            data-variant={variant}
            className={cn(itemMediaVariants({ variant, className }))}
            {...props}
        />
    )
}

/** 行数档：标题/描述显示几行属内容语境，收成一个 prop，
    调用方不再手写 line-clamp-*（那是外观，会被 no-restyle 拦下来） */
const ITEM_LINES = {
    1: "line-clamp-1",
    2: "line-clamp-2",
    3: "line-clamp-3",
} as const

type ItemLines = keyof typeof ITEM_LINES

function ItemContent({ className, ...props }: React.ComponentProps<"div">) {
    return (
        <div
            data-slot="item-content"
            className={cn(
                "flex flex-1 flex-col gap-1 group-data-[size=xs]/item:gap-0 [&+[data-slot=item-content]]:flex-none",
                className,
            )}
            {...props}
        />
    )
}

function ItemTitle({
    className,
    lines = 1,
    ...props
}: React.ComponentProps<"div"> & { lines?: ItemLines }) {
    return (
        <div
            data-slot="item-title"
            className={cn(
                ITEM_LINES[lines],
                "flex w-fit items-center gap-2 text-sm leading-snug font-medium underline-offset-4",
                className,
            )}
            {...props}
        />
    )
}

function ItemDescription({
    className,
    lines = 2,
    ...props
}: React.ComponentProps<"p"> & { lines?: ItemLines }) {
    return (
        <p
            data-slot="item-description"
            className={cn(
                ITEM_LINES[lines],
                "text-left text-sm leading-normal font-normal text-muted-foreground group-data-[size=xs]/item:text-xs [&>a]:underline [&>a]:underline-offset-4 [&>a:hover]:text-primary",
                className,
            )}
            {...props}
        />
    )
}

function ItemActions({ className, ...props }: React.ComponentProps<"div">) {
    return (
        <div
            data-slot="item-actions"
            className={cn("flex items-center gap-2", className)}
            {...props}
        />
    )
}

function ItemHeader({ className, ...props }: React.ComponentProps<"div">) {
    return (
        <div
            data-slot="item-header"
            className={cn("flex basis-full items-center justify-between gap-2", className)}
            {...props}
        />
    )
}

function ItemFooter({ className, ...props }: React.ComponentProps<"div">) {
    return (
        <div
            data-slot="item-footer"
            className={cn("flex basis-full items-center justify-between gap-2", className)}
            {...props}
        />
    )
}

export {
    Item,
    ItemMedia,
    ItemContent,
    ItemActions,
    ItemGroup,
    ItemSeparator,
    ItemTitle,
    ItemDescription,
    ItemHeader,
    ItemFooter,
}
