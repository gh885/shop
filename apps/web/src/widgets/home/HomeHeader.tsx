import { useState } from "react"
import { Link } from "@tanstack/react-router"
import { ChevronDown, Search } from "lucide-react"

import {
    Button,
    ButtonGroup,
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    Input,
    Logo,
    Sticky,
} from "@shop/ui-web"

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
                <div className="mx-auto flex h-full max-w-(--container-page) items-center gap-14 px-6">
                    {/* 品牌 logo：图形标 + 字标 */}
                    <Link
                        to="/"
                        className="shrink-0"
                        aria-label="有店首页"
                    >
                        <Logo size={36} />
                    </Link>

                    {/* 中间大搜索框：2px 橙描边 + 实色橙按钮（淘宝标志性元素），分类下拉 + 输入框 + 搜索按钮拼合 */}
                    <div className="mx-auto w-full max-w-3xl">
                        <ButtonGroup className="h-12 w-full rounded-lg border-2 border-primary bg-background focus-within:shadow-float">
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
                            <span className="h-5 w-px shrink-0 bg-border" />

                            <Input
                                aria-label="搜索商品"
                                placeholder="搜索商品"
                                className="h-full flex-1 rounded-none border-0 bg-transparent px-3 text-base shadow-none focus-visible:ring-0"
                            />

                            <Button className="mr-0.5 h-11 px-8 text-base">
                                <Search />
                                搜索
                            </Button>
                        </ButtonGroup>
                    </div>
                </div>
            </header>
        </Sticky>
    )
}
