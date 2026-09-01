// ---------- 卖家端领域层（纯类型 + wire → 投影，不碰 React / 网络） ----------
// 与买家端 web 的 domain 分工一致：wire（SDK）全可选，这里投影为稳定非空/字面量领域形状。
// 只导出消费者真正需要的类型与投影函数（省得业务方跨包取）。

// ---------- 商品 ----------
export type { Product, ProductStatus, ActiveStatus, Sku } from "./product"
export { toProduct, toSku, toProductDetail } from "./product"

// ---------- 类目 ----------
export type { CategoryNode } from "./category"
export { toCategoryNode, toCategoryTree } from "./category"

// ---------- 店铺 ----------
export type {
    Shop,
    ShopStatus,
    ShopRole,
    MemberStatus,
    ShopInviteItem,
    ShopMemberItem,
} from "./shop"
export { toShop, toShopInviteItem, toShopMemberItem } from "./shop"
