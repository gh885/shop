import { useEffect, useState } from "react"
import { Tabs, TabsList, TabsTrigger } from "@shop/ui-web"

import { Sticky } from "#/shared/ui/sticky"

/** 左栏五个区块的 id（DetailSection 的锚点），顺序即 tab 顺序 */
export const DETAIL_SECTIONS = [
    { id: "reviews", label: "用户评价" },
    { id: "params", label: "参数信息" },
    { id: "detail", label: "图文详情" },
    { id: "shop-reco", label: "本店推荐" },
    { id: "also-viewed", label: "看了又看" },
] as const

/**
 * 左栏吸顶锚点导航：点击滚动到对应区块；scrollspy 反向高亮当前所在区块。
 * 页面顶栏不吸顶，因此本条 top-0 即可干净地钉在视口顶部。
 */
export function DetailSectionTabs() {
    const [active, setActive] = useState<string>(DETAIL_SECTIONS[0].id)

    // scrollspy：区块与视口上部 10%~30% 区域相交时视为「当前」
    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    if (entry.isIntersecting) setActive(entry.target.id)
                }
            },
            // 视口顶部往下 10%~30% 的窄带作为判定区，自上而下滚动时逐个触发
            { rootMargin: "-10% 0px -70% 0px" },
        )
        for (const { id } of DETAIL_SECTIONS) {
            const el = document.getElementById(id)
            if (el) observer.observe(el)
        }
        return () => observer.disconnect()
    }, [])

    return (
        <Sticky top={0}>
            <div className="rounded-2xl bg-background">
                <Tabs
                    value={active}
                    onValueChange={(value) => {
                        document
                            .getElementById(value)
                            ?.scrollIntoView({ behavior: "smooth", block: "start" })
                    }}
                >
                    <TabsList variant="line">
                        {DETAIL_SECTIONS.map((s) => (
                            <TabsTrigger
                                key={s.id}
                                value={s.id}
                                className="px-4 text-base data-active:text-primary data-active:after:bg-primary"
                            >
                                {s.label}
                            </TabsTrigger>
                        ))}
                    </TabsList>
                </Tabs>
            </div>
        </Sticky>
    )
}
