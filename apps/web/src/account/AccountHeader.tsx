import { useState } from "react"
import { Link, useNavigate } from "@tanstack/react-router"
import { Search } from "lucide-react"

import { Button, Logo } from "@shop/ui-web"

/**
 * 账号类页头（个人中心 / 订单详情共用）：左品牌字标（Logo + 标题），右侧橙框大搜索框。
 *
 * 与首页 HomeHeader 同族但更轻：不吸顶、无分类下拉，仅「品牌 + 搜索」，
 * 契合账号页「工具性页面」的定位。宽度随版心（account 布局内同步 1486px）。
 */

export function AccountHeader({
    title = "个人中心",
    widthClass = "max-w-(--container-page)",
}: {
    title?: string
    widthClass?: string
}) {
    const [keyword, setKeyword] = useState("")

    const navigate = useNavigate()

    function onSubmit(e: React.FormEvent) {
        e.preventDefault()
        const q = keyword.trim()
        if (!q) return
        // TODO: 搜索落地页（/products 列表）未实现，先回首页；落地后接 `/products?keyword=…`
        void navigate({ to: "/" })
    }

    return (
        <header className="border-b border-border/60 bg-background">
            <div
                className={`mx-auto flex h-16 ${widthClass} items-center justify-between gap-8 px-6`}
            >
                {/* 左：品牌 logo + 标题 */}
                <Link
                    to="/"
                    className="flex shrink-0 items-center gap-3"
                    aria-label="返回首页"
                >
                    <Logo size={40} />
                    <span className="text-2xl font-black tracking-tight text-foreground">
                        {title}
                    </span>
                </Link>

                {/* 右：橙框大搜索框 */}
                <form
                    onSubmit={onSubmit}
                    className="w-full max-w-xl"
                >
                    <div className="flex h-11 items-center rounded-xl border border-border bg-background">
                        <input
                            value={keyword}
                            onChange={(e) => setKeyword(e.target.value)}
                            placeholder="搜索功能即将上线"
                            aria-label="搜索商品"
                            disabled
                            className="h-full flex-1 cursor-not-allowed bg-transparent px-3 text-sm text-foreground opacity-60 outline-none placeholder:text-muted-foreground"
                        />
                        <Button
                            type="submit"
                            disabled
                            className="m-1 h-9 cursor-not-allowed"
                        >
                            <Search />
                            搜索
                        </Button>
                    </div>
                </form>
            </div>
        </header>
    )
}
