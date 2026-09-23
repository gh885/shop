/**
 * shop 域 · address —— 商家地址库（发货/退货地址）：
 * - address-form.ts ：表单纯逻辑（校验 schema / 字段清单 / 初值 toDefaults），口径与买家侧同源
 * - queries.ts ：TanStack Query 定义层（key 工厂 + SDK 调用封装 + 列表/增删改/设默认 hooks）
 * - AddressFormDialog.tsx / AddressTable.tsx ：表单与列表组件
 *
 * 表单里不含省市区名：只存 6 位 regionCode，三级名在 queries 提交时按区划库反查补齐。
 * 「当前店铺 ID」的全局单例在 shared/lib/shop-store，请求头 X-Shop-Id 由传输层注入。
 */

export {
    addressListOptions,
    useDeleteAddress,
    useSetDefaultShip,
    useSetDefaultReturn,
} from "./queries"
