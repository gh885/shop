/**
 * address —— 收货地址领域文件夹（扁形态：纯逻辑 + hook + 组件内聚）。
 * - address.ts           ：类型 + wire→投影（toAddress）
 * - use-address.ts       ：列表 query + 增删改/默认态 mutation + 智能粘贴 parseAddressText
 * - AddressTable.tsx / AddressFormDialog.tsx ：受控组件（表单校验 zchema 局部在 AddressFormDialog 内）
 *
 * 国标行政区划数据源与级联选择器都是共享件：算法在 @shop/common 的 regions，组件在 @shop/ui-web。
 */

export { type Address } from "./address"

export {
    addressListOptions,
    useDeleteAddress,
    useSetDefaultAddress,
    useUnsetDefaultAddress,
} from "./queries"

export { AddressTable } from "./AddressTable"
export { AddressFormDialog } from "./AddressFormDialog"
