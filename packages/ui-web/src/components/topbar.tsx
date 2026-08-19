"use client"

import * as React from "react"
import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"

import { cn } from "src/lib/utils"

// 顶栏复合组件：品牌区 + 主导航区（一级 Tab）+ 动作区 三段式横向组合。
// 与 sidebar 的封装风格一致：data-slot 标识 + useRender 多态注入（render 接路由 Link）。
// 顶栏暂无跨段共享状态，故不需要 Provider/Context；有需要再加。

/** 顶栏容器：sticky 吸顶，横排「品牌区 + 导航区 + 动作区」 */
function TopBar({ className, children, ...props }: React.ComponentProps<"header">) {
    return (
        <header
            data-slot="topbar"
            className={cn(
                "sticky top-0 z-40 flex h-14 shrink-0 items-center gap-1 border-b bg-background px-4",
                className,
            )}
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
            className={cn("mr-4 flex shrink-0 items-center", className)}
            {...props}
        />
    )
}

/** 主导航区：一级 Tab 横排，溢出时横向滚动 */
function TopBarNav({ className, ...props }: React.ComponentProps<"nav">) {
    return (
        <nav
            data-slot="topbar-nav"
            className={cn("flex min-w-0 flex-1 items-center gap-1 overflow-x-auto", className)}
            {...props}
        />
    )
}

const topBarNavItemClassName =
    "flex h-9 shrink-0 items-center gap-1.5 rounded-md px-3 text-sm text-muted-foreground ring-ring outline-hidden transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50 data-active:bg-accent data-active:font-medium data-active:text-accent-foreground [&>svg]:size-4 [&>svg]:shrink-0"

/** 单条一级 Tab：render 注入路由 Link，激活态走 data-active（isActive=false 不输出该属性） */
function TopBarNavItem({
    render,
    isActive = false,
    className,
    ...props
}: useRender.ComponentProps<"a"> &
    React.ComponentProps<"a"> & {
        isActive?: boolean
    }) {
    return useRender({
        defaultTagName: "a",
        props: mergeProps<"a">(
            {
                className: cn(topBarNavItemClassName, className),
            },
            props,
        ),
        render,
        state: {
            slot: "topbar-nav-item",
            active: isActive,
        },
    })
}

/** 右侧动作区：员工信息、通知、退出等 */
function TopBarActions({ className, ...props }: React.ComponentProps<"div">) {
    return (
        <div
            data-slot="topbar-actions"
            className={cn("ml-auto flex shrink-0 items-center gap-2", className)}
            {...props}
        />
    )
}

export { TopBar, TopBarActions, TopBarBrand, TopBarNav, TopBarNavItem }
