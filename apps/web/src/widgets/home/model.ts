import type { BannerResponse, NavEntryResponse, RecommendTabResponse } from "@shop/api/sdk"

/**
 * widgets/home 领域层 —— CMS 首页内容类型 + wire → 投影（纯函数，不碰 React / 网络）。
 * 首页为公开读，走生成 SDK 的 CmsPublicApi（见 actions.ts）。
 *
 * 投影字段刻意对齐组件消费：subs/target/iconKey 等可选字段归一成稳定缺省形状。
 */

// ---------- CMS：首页导航 ----------

/** 导航子分组 {name, items[]}，与后端 NavGroup 同构 */
export type NavGroup = { name: string; items: string[] }

/** 首页导航项（投影后形状） */
export type NavEntry = {
    id: string
    title: string
    /** 图标 key（SDK 可空） */
    iconKey: string | null
    /** 跳转目标（SDK 可空） */
    target: string | null
    targetType: string | null
    subs: NavGroup[]
}

/** wire → 投影 */
export function toNavEntry(dto: NavEntryResponse): NavEntry {
    return {
        id: dto.id,
        title: dto.title,
        iconKey: dto.iconKey,
        target: dto.target,
        targetType: dto.targetType,
        subs: dto.subs.map((sub) => ({ name: sub.name, items: sub.items ?? [] })),
    }
}

// ---------- CMS：运营位 banner ----------

/** 首页运营位 banner（投影后形状） */
export type Banner = {
    id: string
    title: string
    /** 副标题（SDK 可空） */
    subtitle: string | null
    image: string
    /** 跳转目标（SDK 可空） */
    target: string | null
    targetType: string | null
    /** 外部链接（SDK 可空） */
    link: string | null
}

/** wire → 投影 */
export function toBanner(dto: BannerResponse): Banner {
    return {
        id: dto.id,
        title: dto.title,
        subtitle: dto.subtitle,
        image: dto.imageUrl,
        target: dto.target,
        targetType: dto.targetType,
        link: dto.link,
    }
}

// ---------- CMS：推荐条词条 ----------

/** 首页推荐条词条（投影后形状） */
export type RecommendTab = {
    id: string
    name: string
    /** 跳转目标（SDK 可空） */
    target: string | null
    targetType: string | null
    isDefault: boolean
}

/** wire → 投影 */
export function toRecommendTab(dto: RecommendTabResponse): RecommendTab {
    return {
        id: dto.id,
        name: dto.name,
        target: dto.target,
        targetType: dto.targetType,
        isDefault: dto.isDefault,
    }
}

// 买家商品形状已下沉到 #/product（Product/ProductDetail），首页商品流直接复用，不再本地定义
