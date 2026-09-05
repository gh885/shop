/**
 * address —— 收货地址领域文件夹（扁形态：纯逻辑 + hook + 组件内聚）。
 * - address.ts           ：类型 + wire→投影（toAddress）
 * - use-address.ts       ：列表 query + 增删改/默认态 mutation + 智能粘贴 parseAddressText
 * - regions.ts           ：国标行政区划懒加载（地址专属）
 * - AddressTable.tsx / AddressFormDialog.tsx ：受控组件（表单校验 zchema 局部在 AddressFormDialog 内）
 */

export { type Address } from "./address"

export {
    useAddressList,
    useDeleteAddress,
    useSetDefaultAddress,
    useUnsetDefaultAddress,
} from "./queries"

export { AddressTable } from "./AddressTable"
export { AddressFormDialog } from "./AddressFormDialog"
