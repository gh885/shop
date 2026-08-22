import type { ParamItem } from "#/entities/product"
import { DetailSection } from "./detail-section"

/** 参数信息：标签/值行列表（首条做居中摘要卡，对齐参考图的书名样式） */
export function ParamsSection({ params }: { params: ParamItem[] }) {
    const [head, ...rest] = params

    return (
        <DetailSection
            id="params"
            title="参数信息"
        >
            {params.length === 0 ? (
                <p className="text-sm text-muted-foreground">暂无参数</p>
            ) : (
                <div className="space-y-4">
                    {head && (
                        // 摘要卡：第一条参数居中大字展示（对齐参考图「丑陋的中国人/书名」）
                        <div className="rounded-xl bg-sunken/50 px-6 py-5 text-center">
                            <p className="text-lg font-bold text-foreground">{head.value}</p>
                            <p className="mt-1 text-sm text-muted-foreground">{head.name}</p>
                        </div>
                    )}
                    <dl className="space-y-3">
                        {rest.map((p) => (
                            <div
                                key={`${p.name}:${p.value}`}
                                className="flex gap-6 text-sm sm:grid sm:grid-cols-[140px_1fr] sm:gap-0"
                            >
                                <dt className="shrink-0 text-muted-foreground">{p.name}</dt>
                                <dd className="text-foreground">{p.value}</dd>
                            </div>
                        ))}
                    </dl>
                </div>
            )}
        </DetailSection>
    )
}
