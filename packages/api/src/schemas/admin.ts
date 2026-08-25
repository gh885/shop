import { z } from "zod"

// ---------- 平台员工认证（/admin/auth/*，staff 账号体系与 C 端隔离） ----------

export const StaffLoginRequestSchema = z.object({
    employeeNo: z.string().min(1).max(50).trim(),
    password: z.string().min(8).max(72),
    deviceId: z.string().min(1).max(100),
})
export type StaffLoginRequest = z.infer<typeof StaffLoginRequestSchema>

export const StaffInfoSchema = z.object({
    id: z.string(),
    employeeNo: z.string(),
    displayName: z.string(),
})
export type StaffInfo = z.infer<typeof StaffInfoSchema>

// ---------- 店铺审核（/admin/reviews） ----------

export const ShopReviewStatusSchema = z.enum(["PENDING", "APPROVED", "REJECTED"])
export type ShopReviewStatus = z.infer<typeof ShopReviewStatusSchema>

export const ShopReviewItemSchema = z.object({
    id: z.string(),
    shopId: z.string(),
    shopName: z.string(),
    ownerPhone: z.string(),
    status: ShopReviewStatusSchema,
    reason: z.string().nullable(),
    decidedAt: z.string().nullable(),
    createdAt: z.string(),
})
export type ShopReviewItem = z.infer<typeof ShopReviewItemSchema>

export const ShopReviewSchema = z.object({
    id: z.string(),
    shopId: z.string(),
    staffId: z.string().nullable(),
    status: ShopReviewStatusSchema,
    reason: z.string().nullable(),
    decidedAt: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
})
export type ShopReview = z.infer<typeof ShopReviewSchema>

/**
 * 分页包装：镜像后端 MyBatis-Plus 分页出参（records/total/size/current/pages 全量字段）。
 * 注意与 PageResult（C 端列表，裁剪为 records+total）是两份契约——各自对齐自己的后端出参，
 * 不要在前端单方面「统一」，除非后端先对齐。
 */
export const ReviewPageSchema = z.object({
    records: z.array(ShopReviewItemSchema),
    total: z.number(),
    size: z.number(),
    current: z.number(),
    pages: z.number(),
})
export type ReviewPage = z.infer<typeof ReviewPageSchema>
