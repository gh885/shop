import type { BannerResponse, NavEntryResponse, NavGroup as SdkNavGroup } from "@shop/api/sdk"

/**
 * widgets/home 领域层 —— CMS 首页内容类型 + wire → 投影（纯函数，不碰 React / 网络）。
 * 首页为公开读，走生成 SDK 的 CmsPublicApi（见 actions.ts）。
 *
 * 投影字段刻意对齐组件消费：subs/target/iconKey 等可选字段归一成稳定缺省形状。
 */

// ---------- CMS：首页导航 ----------

/** 导航子分组 {name, items[]}：契约同后端 NavGroup，仅 items 归一为必有（缺省补 []） */
export type NavGroup = Omit<SdkNavGroup, "items"> & { items: string[] }

/**
 * 首页导航项：契约之上只归一 subs —— sub.items 可空则补 []。
 * 其余字段同名同型，用 Omit 组合，不逐字段抄书（iconKey/target/targetType 的可空语义见契约）。
 */
export type NavEntry = Omit<NavEntryResponse, "subs"> & { subs: NavGroup[] }

/** wire → 投影：唯一归一的是 subs 的 items 缺省 */
export function toNavEntry(dto: NavEntryResponse): NavEntry {
    return { ...dto, subs: dto.subs.map((sub) => ({ name: sub.name, items: sub.items ?? [] })) }
}

// ---------- CMS：运营位 banner ----------

/**
 * 首页运营位 banner：契约之上只改一处 —— imageUrl 改叫 image（组件侧都按 image 取）。
 * 其余字段同名同型，用 Omit 组合，不逐字段抄书。
 */
export type Banner = Omit<BannerResponse, "imageUrl"> & { image: string }

/** wire → 投影：唯一的变换是 imageUrl → image */
export function toBanner(dto: BannerResponse): Banner {
    return { ...dto, image: dto.imageUrl }
}

// ---------- CMS：推荐条词条 ----------
// 词条字段同名同型、无需归一，直接用 SDK `RecommendTabResponse`，不造镜像类型与恒等投影。

// 买家商品形状已下沉到 #/product（Product/ProductDetail），首页商品流直接复用，不再本地定义
