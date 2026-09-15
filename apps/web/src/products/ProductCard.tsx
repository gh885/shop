import { Link } from "@tanstack/react-router"

import { Badge } from "@shop/ui-web"

import { Price } from "#/shared/ui/Price"
import { ProductImage } from "#/shared/ui/ProductImage"
import type { ProductCardData } from "./product"

/**
 * 商品卡：核心分流出口（首页/推荐/搜索/类目通用）。
 *
 * 详情一律新标签页打开（target="_blank"）：feed 是「逛」的场景，点开一件不打断当前列表的浏览与滚动位置。
 * 也因此关掉 preload（默认 intent）：预热的是当前标签页的客户端缓存，新标签页是全新文档、命中不了，
 * 只会白白多打一次最重的详情接口。
 *
 * 两档密度（都对齐参考站实测）：
 * - default：首页 feed 卡，对齐京东货架卡（243×335）——正方形主图 + 92px 信息区，
 *   信息区不设左右内边距，文字与图片左右边缘齐平；标题单行截断。
 *   92 = pt-2(8) + 标题 18 + 标签行 6+18 + 价格行 6+24 + pb-3(12)。
 * - compact：推荐位卡，对齐淘宝店铺推荐卡（199×271）——正方形主图 + 图下 8px + 64px 信息区。
 *   72 = mt-2(8) + 标题 22 + 2 + 标签行 16 + 2 + 价格行 22。
 *
 * 卡片无底色、无阴影（bg-transparent）：吃所在表面，与页面地面融为一体，不做"白卡浮起"；
 * hover 只靠整体上浮 + 标题变主题色反馈。
 * 卡片视图形状 ProductCardData 与 wire→投影 toProductCardData 在 ./product（单一来源）。
 */

export function ProductCard({
    product,
    variant = "default",
}: {
    product: ProductCardData
    variant?: "default" | "compact"
}) {
    const compact = variant === "compact"

    return (
        <Link
            to="/products/$id"
            params={{ id: product.id }}
            target="_blank"
            rel="noopener noreferrer"
            preload={false}
            className="group flex flex-col overflow-hidden rounded-lg transition-transform duration-200 hover:-translate-y-1"
        >
            {/* 图片出血铺满卡片上边缘（图即卡片，货架观感）；无图渲染灰底占位 */}
            <ProductImage
                src={product.image}
                alt={product.title}
            />

            <div className={compact ? "mt-2 flex flex-col" : "flex flex-col pt-2 pb-3"}>
                {/* 标题：单行截断，hover 变主题色 */}
                <p
                    title={product.title}
                    className={`truncate font-medium text-foreground transition-colors group-hover:text-primary ${
                        compact ? "text-sm/5.5" : "text-sm/4.5"
                    }`}
                >
                    {product.title}
                </p>

                {/* 标签排：自营红底 + 服务类描边；无标签也保留行高，网格基线对齐 */}
                <div
                    className={`flex flex-wrap items-center gap-1 line-clamp-2 ${
                        compact ? "mt-0.5" : "mt-1.5"
                    }`}
                >
                    {product.tags?.map((tag, i) => (
                        <Badge
                            key={tag}
                            variant={i === 0 ? "default" : "outline-primary"}
                            size="sm"
                        >
                            {tag}
                        </Badge>
                    ))}
                </div>

                {/* 价格行：价格 + 销量小字 */}
                <div
                    className={`flex items-end gap-1.5 ${compact ? "mt-0.5 h-5.5" : "mt-1.5 h-6"}`}
                >
                    <Price
                        value={product.price}
                        className={`font-bold text-primary ${compact ? "text-xl" : "text-2xl"}`}
                    />
                    {product.sales && (
                        <span className="truncate text-xs text-muted-foreground">
                            {product.sales}
                        </span>
                    )}
                </div>
            </div>
        </Link>
    )
}
