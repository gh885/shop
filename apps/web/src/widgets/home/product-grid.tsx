import { ProductCard, type ProductCardData, type Product } from "#/entities/product"
import { useFeedProducts } from "#/features/home/use-home"

/** 买家商品 → 商品卡片。sales/tags/shop 后端 ProductResponse 暂缺，先不映射（见 actions.fetchFeedProducts TODO） */
function toProductCardData(p: Product): ProductCardData {
    return { id: p.id, image: p.image, title: p.title, price: p.priceMin?.amount ?? 0 }
}

/** 首页第五层：商品卡片网格。useSuspenseQuery：边界内 data 恒非空（挂起由父级 Suspense 骨架兜底） */
export function ProductGrid() {
    const feed = useFeedProducts()

    return (
        <section className="mx-auto max-w-[1400px] px-6 py-6">
            <div className="grid grid-cols-5 gap-3 rounded-xl bg-sunken/50 p-3">
                {feed.data.map((product) => (
                    <ProductCard
                        key={product.id}
                        product={toProductCardData(product)}
                    />
                ))}
            </div>
        </section>
    )
}
