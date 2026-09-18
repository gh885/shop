/**
 * shop —— 卖家店铺域（扁形态，同 product 域）：
 * - queries.ts      ：TanStack Query 定义层（key 工厂 + 我的店铺 / 当前店铺 hooks + SDK 调用封装）
 * - ShopGate.tsx    ：路由级店铺守卫（无 ACTIVE 店铺 → 开店引导页，业务页不再各自兜底）
 * - shop-context.tsx：守卫注入的当前店 context（useShop 非空契约）
 * - constants.ts    ：店铺状态展示映射
 *
 * 「当前店铺 ID」的全局单例（shop-store.ts）留在 shared/lib：它被传输层
 * （shared/lib/api.ts 的 X-Shop-Id 上下文头）消费，属装配基建，不属本域。
 * 桶文件只暴露外部真正消费的那几个；域内一律相对路径直连，不走这里。
 */

export {
    shopKeys,
    shopInvitesOptions,
    useMyShops,
    useCurrentShop,
    setCurrentShopId,
    useMyShopMembers,
} from "./queries"
export { useShop } from "./shop-context"
export { ShopGate } from "./ShopGate"
