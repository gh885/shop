/**
 * shop —— 卖家店铺域（扁形态）：
 * - queries.ts      ：TanStack Query 定义层（key 工厂 + 我的店铺 / 当前店铺 / 子账号列表 + SDK 调用封装）
 * - shop-form.ts    ：店名那一格的表单校验（开店与被拒重提共用）
 * - subaccount.ts   ：子账号域的纯规则（登录名形状、可授予权限码清单与中文标签）
 * - ShopGate.tsx    ：路由级店铺守卫（无店 → 开店引导页，业务页不再各自兜底）
 * - shop-context.tsx：守卫注入的当前店 context（useShop 非空契约）
 * - constants.ts    ：店铺状态展示映射与店名上限
 *
 * 「当前店铺 ID」的全局单例（shop-store.ts）与「当前会话种类」（session-kind.ts）都留在 shared/lib：
 * 它们被传输层（shared/lib/api.ts 的 X-Shop-Id 上下文头与刷新端点）消费，属装配基建，不属本域。
 * 桶文件只暴露外部真正消费的那几个；域内一律相对路径直连，不走这里。
 */

export {
    shopKeys,
    subaccountsOptions,
    useCurrentShop,
    useMyShops,
    setCurrentShopId,
} from "./queries"
export { useShop } from "./shop-context"
export { ShopGate } from "./ShopGate"
// 登录页（`#/auth/subaccount-form`）要的字段规则：子账号域的唯一出口在这里，
// 那边只能走公开入口取，不能深入 `./subaccount`（跨域直插由 oxlint 的 boundaries 拦）
export { SubaccountLoginNameSchema, SubaccountPasswordSchema } from "./subaccount"
