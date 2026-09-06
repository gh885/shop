import { Link } from "@tanstack/react-router"

import { SELLER_URL } from "../shared/lib/external"

const FOOTER_GROUPS = [
    {
        title: "购物",
        links: [{ label: "首页", to: "/" }],
    },
    {
        title: "开店",
        links: [
            { label: "我要开店", to: "/sell" },
            // 店铺/店员/商品管理已迁到卖家中心（apps/seller 独立 SPA）
            { label: "卖家中心", to: SELLER_URL },
        ],
    },
] as const

/** 站点页脚：品牌 + 真实导航路径，不放死链 */
export function SiteFooter() {
    return (
        <footer className="border-t border-border">
            <div className="mx-auto flex max-w-(--container-page) flex-col gap-8 px-4 py-10 md:flex-row md:justify-between">
                <div className="space-y-2">
                    <p className="text-sm font-semibold">Shop 多店铺电商平台</p>
                    <p className="text-sm text-muted-foreground">千万小店，各有各的好。</p>
                </div>

                <div className="flex gap-16">
                    {FOOTER_GROUPS.map((group) => (
                        <div
                            key={group.title}
                            className="space-y-3"
                        >
                            <p className="text-sm font-medium">{group.title}</p>
                            <ul className="space-y-2">
                                {group.links.map((link) => (
                                    <li key={link.label}>
                                        {link.to.startsWith("http") ? (
                                            <a
                                                href={link.to}
                                                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                                            >
                                                {link.label}
                                            </a>
                                        ) : (
                                            <Link
                                                to={link.to as never}
                                                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                                            >
                                                {link.label}
                                            </Link>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>
            </div>

            <div className="border-t border-border">
                <p className="mx-auto max-w-(--container-page) px-4 py-4 text-xs text-muted-foreground">
                    © {new Date().getFullYear()} Shop
                </p>
            </div>
        </footer>
    )
}
