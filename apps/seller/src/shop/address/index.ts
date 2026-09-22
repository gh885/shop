/**
 * shop 域 · address —— 商家地址库（发货/退货地址）：
 * - queries.ts ：TanStack Query 定义层（key 工厂 + SDK 调用封装 + 列表/增删改/设默认 hooks）
 * - AddressFormDialog.tsx / AddressTable.tsx ：表单与列表组件
 *
 * 「当前店铺 ID」的全局单例在 shared/lib/shop-store，请求头 X-Shop-Id 由传输层注入。
 */

export {
    addressListOptions,
    useDeleteAddress,
    useSetDefaultShip,
    useSetDefaultReturn,
} from "./queries"
