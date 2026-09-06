/**
 * shop —— 卖家店铺域（扁形态，同 product 域）：
 * - queries.ts    ：TanStack Query 定义层（key 工厂 + 我的店铺 / 当前店铺 hooks）
 * - data.ts       ：SDK 调用封装（店铺列表 / 邀请 / 成员管理）
 * - constants.ts  ：店铺状态展示映射
 *
 * 「当前店铺 ID」的全局单例（shop-store.ts）留在 shared/lib：它被传输层
 * （shared/lib/api.ts 的 X-Shop-Id 上下文头）消费，属装配基建，不属本域。
 * 桶文件只暴露外部真正消费的那几个；域内一律相对路径直连，不走这里。
 */

export { shopKeys, useMyShops, useCurrentShop, setCurrentShopId } from "./queries"
