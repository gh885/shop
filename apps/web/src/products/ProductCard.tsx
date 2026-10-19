import { Link } from "@tanstack/react-router"

import { useT } from "#/locales/use-t"

import { Image, cn } from "@shop/ui-web"

import { Price } from "#/shared/ui/Price"
import type { ProductCardData } from "./display"

/**
 * 详情一律新标签页打开（target="_blank"）：feed 是「逛」的场景，点开一件不打断当前列表的浏览与滚动位置。
 * 也因此关掉 preload（默认 intent）：预热的是当前标签页的客户端缓存，新标签页是全新文档、命中不了，
 * 只会白白多打一次最重的详情接口。
 */

export function ProductCard({
    product,
    variant = "default",
}: {
    product: ProductCardData
    variant?: "default" | "compact"
}) {
    const compact = variant === "compact"
    const t = useT()

    return (
        <Link
            to="/products/$id"
            params={{ id: product.id }}
            target="_blank"
            rel="noopener noreferrer"
            preload={false}
            className="group flex flex-col overflow-hidden rounded-lg transition-transform duration-200 hover:-translate-y-1"
        >
            <Image
                src={product.image}
                alt={product.title}
                ratio={1}
                hoverScale
                className="w-full"
            />

            <div className={cn(compact ? "mt-2 flex flex-col" : "flex flex-col pt-2 pb-3")}>
                <p
                    title={product.title}
                    className={cn(
                        "truncate font-medium text-foreground transition-colors group-hover:text-primary",
                        compact ? "text-sm/5.5" : "text-sm/4.5",
                    )}
                >
                    {product.title}
                </p>

                <div className={cn("flex items-end gap-1.5", compact ? "mt-1 h-5.5" : "mt-3 h-6")}>
                    <Price
                        value={product.price}
                        className={cn(
                            "font-bold text-primary-subtle-foreground",
                            compact ? "text-xl" : "text-2xl",
                        )}
                    />
                    {product.sales && (
                        <span className="truncate text-xs text-muted-foreground">
                            {t("product.sold", { count: product.sales })}
                        </span>
                    )}
                </div>
            </div>
        </Link>
    )
}
