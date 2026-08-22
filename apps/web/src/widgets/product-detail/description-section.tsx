import type { ProductDetail } from "#/entities/product"
import { DetailSection } from "./detail-section"

/** 左栏「图文详情」区块：描述文字 + 图片纵向铺陈（对齐电商详情页惯例） */
export function DescriptionSection({ detail }: { detail: ProductDetail }) {
    if (detail.description === "" && detail.images.length === 0) {
        return (
            <DetailSection
                id="detail"
                title="图文详情"
            >
                <p className="text-sm text-muted-foreground">暂无图文详情</p>
            </DetailSection>
        )
    }

    return (
        <DetailSection
            id="detail"
            title="图文详情"
        >
            {detail.description && (
                <p className="whitespace-pre-line text-sm leading-relaxed text-foreground/90">
                    {detail.description}
                </p>
            )}
            {detail.images.length > 0 && (
                <div className="mt-4 flex flex-col items-center gap-2">
                    {detail.images.map((img) => (
                        <img
                            key={img}
                            src={img}
                            alt="商品详情图"
                            loading="lazy"
                            className="w-full max-w-2xl rounded-lg object-contain"
                        />
                    ))}
                </div>
            )}
        </DetailSection>
    )
}
