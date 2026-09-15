import { Link } from "@tanstack/react-router"

import type { Banner } from "./model"

/** 单个 banner 位：图 + 底部渐变标题，hover 微缩放 */
export function HomeBannerItem({ banner }: { banner: Banner }) {
    return (
        // TODO: banner 规划了跳转链路（活动页/商品聚合页），暂无对应路由，先落回首页
        <Link
            to="/"
            className="group relative h-50 min-w-0 flex-1 overflow-hidden rounded-lg bg-sunken/50 text-left"
        >
            <img
                src={banner.image}
                alt={banner.title}
                loading="lazy"
                onError={(e) => {
                    e.currentTarget.style.display = "none"
                }}
                className="inset-0 h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-4">
                <div className="text-base font-bold text-white">{banner.title}</div>
                {banner.subtitle && (
                    <div className="mt-0.5 text-xs text-white/80">{banner.subtitle}</div>
                )}
            </div>
        </Link>
    )
}
