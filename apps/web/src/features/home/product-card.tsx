import { Plus } from "lucide-react"

/** 商品卡片（京东式）：方形图 + 两行标题 + 标签排 + 价格/销量/加购 */
export interface ProductCardData {
    id: string
    image: string
    /** 商品标题 */
    title: string
    /** 价格（分） */
    price: number
    /** 销量描述 */
    sales: string
    /** 标签排，如 自营 / 放心购 */
    tags?: string[]
    /** 店铺名 */
    shop?: string
}

/** 价格按 元.角分 拆成三段：¥ 小、整数大、小数小 */
function Price({ value, className }: { value: number; className?: string }) {
    const yuan = Math.floor(value / 100)
    const cents = String(value % 100).padStart(2, "0")
    return (
        <span className={`font-bold tabular-nums leading-none ${className ?? ""}`}>
            <span className="text-[0.65em]">¥</span>
            <span className="text-xl tracking-tight">{yuan}</span>
            <span className="text-[0.7em]">.{cents}</span>
        </span>
    )
}

export function ProductCard({ product }: { product: ProductCardData }) {
    return (
        <div className="group flex cursor-pointer flex-col overflow-hidden rounded-lg bg-background transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_12px_32px_-8px_rgba(0,0,0,0.18)]">
            {/* 图片：方形、铺满、轻微圆角，hover 微放大 */}
            <div className="relative overflow-hidden rounded-lg bg-white">
                <img
                    src={product.image}
                    alt={product.title}
                    loading="lazy"
                    className="aspect-square w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
                />
            </div>

            <div className="flex flex-col px-2 pt-2.5 pb-3">
                {/* 标题：两行截断，hover 变主题色 */}
                <p className="line-clamp-2 min-h-11 text-sm leading-snug text-foreground transition-colors group-hover:text-primary">
                    {product.title}
                </p>

                {/* 标签排：自营红底 + 服务类描边 */}
                {product.tags && product.tags.length > 0 && (
                    <div className="mt-1.5 flex h-4 items-center gap-1 overflow-hidden">
                        {product.tags.map((tag, i) => (
                            <span
                                key={tag}
                                className={
                                    i === 0
                                        ? "rounded-[3px] bg-primary px-1 text-[10px] leading-4 font-medium text-primary-foreground"
                                        : "rounded-[3px] border border-primary/50 px-1 text-[10px] leading-[13px] text-primary"
                                }
                            >
                                {tag}
                            </span>
                        ))}
                        {product.shop && (
                            <button
                                type="button"
                                title={product.shop}
                                className="truncate text-[11px] text-muted-foreground transition-colors hover:text-primary"
                            >
                                {product.shop}
                            </button>
                        )}
                    </div>
                )}

                {/* 最下行：价格 + 销量小字，右侧加购按钮 */}
                <div className="mt-1.5 flex items-center gap-1.5">
                    <Price
                        value={product.price}
                        className="text-primary"
                    />
                    <span className="truncate text-[11px] text-muted-foreground">
                        {product.sales}
                    </span>
                    <button
                        type="button"
                        aria-label="加入购物车"
                        className="ml-auto flex size-7 shrink-0 items-center justify-center rounded-full border border-primary/40 text-primary transition-all duration-200 hover:bg-primary hover:text-primary-foreground active:scale-90"
                    >
                        <Plus className="size-4" />
                    </button>
                </div>
            </div>
        </div>
    )
}
