"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Search as SearchIcon } from "lucide-react"

import { cn } from "src/lib/utils"
import { Input } from "src/components/ui/input"

// 顶栏复合组件（B 端工作台：seller/admin）。
// 对标 shadcn sidebar 的封装风格：
//   - cva 变体表达视觉分歧（solid / floating），消费方选变体而不是盖默认值；
//   - CSS 变量 --topbar-height 统一高度，子件与 app 都能调；
//   - data-slot / data-topbar 作为样式与测试钩子；
//   - useRender 多态注入（render 接路由 Link）。
// 顶栏暂无跨段共享状态，故不需要 Provider/Context；有需要再加。

const TOPBAR_HEIGHT = "3.5rem" // 默认 h-14

const topBarVariants = cva(
    // 布局骨架：flex 横排 + 尺寸由 --topbar-height 驱动
    "flex h-(--topbar-height) shrink-0 items-center gap-1",
    {
        variants: {
            variant: {
                /** 实心吸顶条：边框 + 白底（默认，如 admin） */
                default: "border-b bg-background px-4",
                /** 透明浮起：无边框无底色，让 canvas 透出（如 seller 浮顶栏） */
                floating: "border-b-0 bg-transparent px-4",
            },
            sticky: {
                /** 吸顶（默认：窗口/滚动容器顶部） */
                true: "sticky top-0 z-40",
                /** 随内容滚动（发布流程页让位给贴顶页签） */
                false: "static",
            },
        },
        defaultVariants: {
            variant: "default",
            sticky: true,
        },
    },
)

/** 顶栏容器：横排「品牌区 + 动作区」，尺寸/变体经 props 声明 */
function TopBar({
    variant,
    sticky,
    className,
    style,
    children,
    ...props
}: React.ComponentProps<"header"> & VariantProps<typeof topBarVariants>) {
    return (
        <header
            data-slot="topbar"
            data-topbar=""
            className={cn(topBarVariants({ variant, sticky }), className)}
            style={
                {
                    "--topbar-height": TOPBAR_HEIGHT,
                    ...style,
                } as React.CSSProperties
            }
            {...props}
        >
            {children}
        </header>
    )
}

/** 品牌区：logo / 平台名，通常放最左 */
function TopBarBrand({ className, ...props }: React.ComponentProps<"div">) {
    return (
        <div
            data-slot="topbar-brand"
            data-topbar="brand"
            className={cn("mr-4 flex shrink-0 items-center", className)}
            {...props}
        />
    )
}

/** 右侧动作区：员工信息、通知、退出等 */
function TopBarActions({ className, ...props }: React.ComponentProps<"div">) {
    return (
        <div
            data-slot="topbar-actions"
            data-topbar="actions"
            className={cn("ml-auto flex shrink-0 items-center gap-2", className)}
            {...props}
        />
    )
}

/**
 * 顶栏搜索框：胶囊 + 无描边 + 白底，前置图标绝对定位在内。
 *
 * 搜索是顶栏的一段（和 Brand / Nav / Actions 同层），所以住在顶栏家族里，
 * 而不是各 app 各拼一遍「relative 包一层 + 绝对定位图标 + 给输入框补 pl-9」。
 * 宽度与显隐属布局，交给调用方用 className 定（`hidden w-60 md:block` 之类）。
 */
function TopBarSearch({ className, ...props }: React.ComponentProps<"input">) {
    return (
        <div
            data-slot="topbar-search"
            data-topbar="search"
            className={cn("relative", className)}
        >
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
                type="search"
                className="h-9 rounded-full border-transparent bg-background pl-9 shadow-none focus-visible:border-transparent focus-visible:ring-2"
                {...props}
            />
        </div>
    )
}

export { TopBar, TopBarActions, TopBarBrand, TopBarSearch }
