import { z } from "zod"

/**
 * entities/address 凝聚模块 —— 领域对象 + 规则 + 数据层。
 *
 * - 本文件（model.ts）：DTO（私有）+ 业务形状 + 领域规则
 * - actions.ts：读写命令（纯逻辑）
 * 对外（index.ts）只暴露业务 Address / AddressInput / 规则 / actions，传输 DTO 不出门。
 */

// ---------- 传输层（私有，实体内部细节） ----------

/** 后端返回的地址 DTO，镜像 wire 形状，用于校验响应合规 */
const AddressDtoSchema = z.object({
    id: z.uuid(),
    userId: z.uuid(),
    receiverName: z.string(),
    phone: z.string(),
    regionCode: z.string(),
    province: z.string(),
    city: z.string(),
    district: z.string(),
    detail: z.string(),
    label: z.string().nullable(),
    isDefault: z.boolean(),
    createdAt: z.string(),
    updatedAt: z.string(),
})

// ---------- 业务层 ----------

/** schema 即 mapper：一次 .parse() 完成「校验合规 + 塑形」，业务类型由 z.infer 派生 */
export const AddressSchema = AddressDtoSchema.transform((dto) => ({
    id: dto.id,
    receiver: dto.receiverName,
    phone: dto.phone,
    regionCode: dto.regionCode,
    province: dto.province,
    city: dto.city,
    district: dto.district,
    detail: dto.detail,
    label: dto.label ?? undefined,
    isDefault: dto.isDefault,
}))
export type Address = z.infer<typeof AddressSchema>

/** 新增/修改地址的表单入参（业务形状，receiver 而非 receiverName） */
export const AddressInputSchema = z.object({
    receiver: z.string().trim().min(1, "请输入收货人").max(30, "收货人最长 30 字"),
    phone: z.string().regex(/^[0-9+-]{5,20}$/, "手机号格式不正确"),
    regionCode: z.string().trim().min(1, "请选择所在地区").max(12),
    province: z.string().trim().min(1, "请选择所在地区").max(30),
    city: z.string().trim().min(1, "请选择所在地区").max(30),
    district: z.string().trim().min(1, "请选择所在地区").max(30),
    detail: z.string().trim().min(1, "请输入详细地址").max(120, "详细地址最长 120 字"),
    label: z.string().max(20).optional(),
    isDefault: z.boolean().optional(),
})
export type AddressInput = z.infer<typeof AddressInputSchema>

// ---------- 领域规则 ----------

/** 手机号是否合法（中国大陆 11 位） */
export const isUsablePhone = (phone: string) => /^1[3-9]\d{9}$/.test(phone)

/** 地址是否完整可配送（下单前置校验） */
export const isComplete = (a: Address) =>
    Boolean(a.receiver && a.phone && a.province && a.city && a.district && a.detail)

/** 地址列表中是否存在默认地址 */
export const hasDefault = (addrs: Address[]) => addrs.some((a) => a.isDefault)

/**
 * 把 targetId 设为唯一默认，其余全部取消默认。
 * 默认地址唯一性是不能散落在各 feature 里的领域不变量。
 */
export const setDefault = (addrs: Address[], targetId: string) =>
    addrs.map((a) => ({ ...a, isDefault: a.id === targetId }))
