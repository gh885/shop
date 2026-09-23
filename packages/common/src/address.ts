/**
 * address —— 地址字段口径 + 「省市区名」派生，web 收货地址与 seller 商家地址共用一份。
 *
 * 两端最终落到同一套后端校验（人名/地名 @Size(max=30)、号码 ^[0-9+\-]{5,20}$、区划码 ^\d{6}$、
 * 详址 @Size(max=120)），所以这些片段只在这里写一次；各端按自己那侧的必填差异拼 object schema
 * （收货人 vs 联系人、买家区级必填而商家区级可空）。
 *
 * 省/市/区是三个**派生列**，不是用户输入：用户选的是一个 6 位区划码，名字在提交时按区划库反查
 * （regionNamesByCode）。表单里再存三份名字，等于让同一事实有两个来源——展示走反查、落库走手填，
 * 两者一旦不一致就没人说得清哪个算数。
 */

import { z } from "zod"

import { findPath } from "./regions"

/** 人名/地名上限（后端 @Size(max = 30)）：收货人、联系人共用 */
export const ADDRESS_NAME_MAX = 30

/** 详细地址上限（后端 @Size(max = 120)） */
export const ADDRESS_DETAIL_MAX = 120

/** 地址上的号码：不卡大陆手机号格式——收件地址里填带区号的固话是常态，地址不是登录账号 */
export const AddressPhoneSchema = z.string().regex(/^[0-9+-]{5,20}$/, "手机号格式不正确")

/** 6 位国标区划码（直筒子市是区划库合成的 `市码+00`，见 regions.loadChildren） */
export const AddressRegionCodeSchema = z.string().regex(/^\d{6}$/, "请选择所在地区")

/** 详细地址：非空，且不重复省市区（占位文案里就写着「不需要重复输入省/市/区」） */
export const AddressDetailSchema = z
    .string()
    .trim()
    .min(1, "请输入详细地址")
    .max(ADDRESS_DETAIL_MAX, `详细地址最长 ${ADDRESS_DETAIL_MAX} 字`)

/** 区划三级名（落库的冗余列） */
export interface RegionNames {
    province: string
    city: string
    district: string
}

/**
 * 6 位区划码 → 省/市/区展示名，与级联选择器显示的是同一条路径（同一个 findPath）。
 *
 * 反查不到三级时缺的那级为空串，调用方拿它当「这码不认」判据即可：能进地址表单的 code 只有两个
 * 来源——选择器的叶子（恒三级）与智能粘贴（回填前先过本函数），所以提交时不会再落进空串分支。
 */
export async function regionNamesByCode(code: string): Promise<RegionNames> {
    const path = await findPath(code)
    return {
        province: path[0]?.label ?? "",
        city: path[1]?.label ?? "",
        district: path[2]?.label ?? "",
    }
}
