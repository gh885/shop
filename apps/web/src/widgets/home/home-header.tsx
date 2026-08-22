import { useState } from "react"
import { Link } from "@tanstack/react-router"
import { ChevronDown, Search } from "lucide-react"

import {
    Button,
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    Logo,
} from "@shop/ui-web"

import { Sticky } from "#/shared/ui/sticky"

/** 第一层顶栏高度（px）。推荐条吸顶时以此为 top 偏移 */
export const HOME_HEADER_HEIGHT = 64

/** 首页第一层：sticky 顶栏，左侧 logo，中间大搜索框（整体圆角容器 + 分类下拉） */
export function HomeHeader() {
    const [category, setCategory] = useState("宝贝")

    return (
        <Sticky top={0}>
            <header
                className="border-b border-border/60 bg-background/95 backdrop-blur"
                style={{ height: HOME_HEADER_HEIGHT }}
            >
                <div className="mx-auto flex h-full max-w-[1400px] items-center gap-14 px-6">
                    {/* 品牌 logo：图形标 + 字标 */}
                    <Link
                        to="/"
                        className="shrink-0"
                        aria-label="有店首页"
                    >
                        <Logo size={36} />
                    </Link>

                    {/* 中间大搜索框：整体圆角容器，分类下拉 + 输入框 + 搜索按钮 */}
                    <div className="mx-auto w-full max-w-3xl">
                        <div className="flex h-12 items-center rounded-xl border-2 border-primary bg-background">
                            {/* 分类下拉：橙色文字 + 箭头，竖线分隔 */}
                            <DropdownMenu>
                                <DropdownMenuTrigger className="flex shrink-0 items-center gap-1 pl-5 pr-3 text-base font-medium text-primary transition-colors hover:text-primary-hover">
                                    {category}
                                    <ChevronDown className="size-4" />
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="start">
                                    {["宝贝", "全部"].map((c) => (
                                        <DropdownMenuItem
                                            key={c}
                                            onClick={() => setCategory(c)}
                                        >
                                            {c}
                                        </DropdownMenuItem>
                                    ))}
                                </DropdownMenuContent>
                            </DropdownMenu>
                            <span className="h-5 w-px bg-border" />

                            <input
                                placeholder="搜索商品"
                                className="h-full flex-1 bg-transparent px-3 text-base text-foreground outline-none placeholder:text-muted-foreground"
                            />

                            <Button className="m-1 h-10 px-6 text-base">
                                <Search />
                                搜索
                            </Button>
                        </div>
                    </div>
                </div>
            </header>
        </Sticky>
    )
}
