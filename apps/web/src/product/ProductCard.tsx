import { Link, useNavigate } from "@tanstack/react-router"
import { Plus } from "lucide-react"

import { Badge, Tooltip, TooltipContent, TooltipTrigger } from "@shop/ui-web"

/**
 * 商品卡：核心分流出口（首页/推荐/搜索/类目通用）。
 * 这里用 router 全局默认的 preload="intent"（悬停即预热详情），
 * 不用 "render"：卡片网格同一屏几十张，render 会在首帧并发拉起大量详情请求（详情是全站最重跳转）。
 * intent 交给浏览器悬停时机，是 feed 场景的正确默认。
 */

/** 商品卡片（京东式）：方形图 + 两行标题 + 标签排 + 价格/销量/加购。商品域 UI，首页/详情推荐/搜索/类目页共用 */
export interface ProductCardData {
    id: string
    image: string
    /** 商品标题 */
    title: string
    /** 价格（分） */
    price: number
    /** 销量描述。后端 ProductResponse 暂未提供 sales 聚合字段，接上后直接给 */
    sales?: string
    /** 标签排，如 自营 / 放心购 */
    tags?: string[]
    /** 店铺名 */
    shop?: string
}

/** 价格按 元.角分 拆成三段：¥ 小、整数大、小数小。价格是全卡视觉锚点，字重要压得住 */
function Price({ value, className }: { value: number; className?: string }) {
    const yuan = Math.floor(value / 100)
    const cents = String(value % 100).padStart(2, "0")
    return (
        <span className={`font-bold tabular-nums leading-none ${className ?? ""}`}>
            <span className="text-[0.6em]">¥</span>
            <span className="text-2xl tracking-tight">{yuan}</span>
            <span className="text-[0.65em]">.{cents}</span>
        </span>
    )
}

export function ProductCard({ product }: { product: ProductCardData }) {
    const navigate = useNavigate()

    return (
        <Link
            to="/products/$id"
            params={{ id: product.id }}
            className="group flex flex-col overflow-hidden rounded-lg bg-background shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lift"
        >
            {/* 图片出血铺满卡片上边缘（图即卡片，货架观感）；无图渲染灰底占位，避免 img src="" 警告 */}
            {product.image ? (
                <img
                    src={product.image}
                    alt={product.title}
                    loading="lazy"
                    className="aspect-square w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
                />
            ) : (
                <div className="flex aspect-square w-full items-center justify-center bg-muted text-xs text-muted-foreground">
                    暂无图片
                </div>
            )}

            <div className="flex flex-col px-2.5 pt-2 pb-3">
                {/* 标题：两行截断，hover 变主题色 */}
                <p className="line-clamp-2 min-h-11 text-sm leading-snug text-foreground transition-colors group-hover:text-primary">
                    {product.title}
                </p>

                {/* 标签排：自营红底 + 服务类描边；无标签也保留行高，网格基线对齐 */}
                <div className="mt-1.5 flex h-4 items-center gap-1 overflow-hidden">
                    {product.tags?.map((tag, i) => (
                        <Badge
                            key={tag}
                            variant={i === 0 ? "default" : "outline"}
                            className={
                                i === 0
                                    ? "h-4 rounded-[3px] px-1 text-[10px]"
                                    : "h-4 rounded-[3px] border-primary/50 px-1 text-[10px] text-primary"
                            }
                        >
                            {tag}
                        </Badge>
                    ))}
                </div>

                {/* 店铺行：始终占位（固定行高），无店铺名时留空，保证网格内卡片基线一致 */}
                <div className="mt-1 flex h-4 items-center">
                    {product.shop && (
                        <Tooltip>
                            <TooltipTrigger
                                render={
                                    <button
                                        type="button"
                                        className="truncate text-xs text-muted-foreground transition-colors hover:text-primary"
                                    >
                                        {product.shop}
                                    </button>
                                }
                            />
                            <TooltipContent>{product.shop}</TooltipContent>
                        </Tooltip>
                    )}
                </div>

                {/* 最下行：价格 + 销量小字，右侧加购按钮 */}
                <div className="mt-1.5 flex items-center gap-1.5">
                    <Price
                        value={product.price}
                        className="text-primary"
                    />
                    {product.sales && (
                        <span className="truncate text-xs text-muted-foreground">
                            {product.sales}
                        </span>
                    )}
                    <button
                        type="button"
                        aria-label="加入购物车"
                        onClick={(e) => {
                            // 卡片整体是 Link，阻止默认导航；加购需选规格，引导进详情页
                            e.preventDefault()
                            e.stopPropagation()
                            navigate({ to: "/products/$id", params: { id: product.id } })
                        }}
                        className="ml-auto flex size-7 shrink-0 items-center justify-center rounded-full border border-primary/40 text-primary transition-all duration-200 hover:bg-primary hover:text-primary-foreground active:scale-90"
                    >
                        <Plus className="size-4" />
                    </button>
                </div>
            </div>
        </Link>
    )
}
