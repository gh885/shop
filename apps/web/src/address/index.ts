/**
 * address —— 收货地址领域文件夹（扁形态：纯逻辑 + hook + 组件内聚）。
 * - address.ts           ：类型 + wire→投影（toAddress）+ 「选中哪一条」判据（pickedAddressId）
 * - address-form.ts      ：表单纯逻辑（校验 schema / 初值 toDefaults / 标签判定）
 * - queries.ts           ：列表 query + 增删改/默认态 mutation + 智能粘贴 parseAddressText
 * - AddressTable.tsx / AddressFormDialog.tsx ：受控组件（只渲染与编排，逻辑在上两个 .ts）
 *
 * 国标行政区划数据源与级联选择器都是共享件：算法在 @shop/common 的 regions / address，组件在 @shop/ui-web。
 * 表单只存 regionCode，省市区名提交时按码反查（queries.ts 的 toAddressRequest，见 ACC-81）。
 */

export { pickedAddressId, type Address } from "./address"

export {
    addressListOptions,
    useDeleteAddress,
    useSetDefaultAddress,
    useUnsetDefaultAddress,
} from "./queries"

export { AddressTable } from "./AddressTable"
export { AddressFormDialog } from "./AddressFormDialog"
