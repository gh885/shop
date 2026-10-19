import { StaffStatus, UserStatus } from "@shop/api/sdk"
import { createPaginationSearchSchema } from "@shop/app-kit/data"
import { z } from "zod"

const UserStatusSchema = z.enum(UserStatus)
const StaffStatusSchema = z.enum(StaffStatus)

export const userSearchSchema = createPaginationSearchSchema(20).extend({
    status: UserStatusSchema.optional(),
    keyword: z.string().optional(),
})
export const staffSearchSchema = createPaginationSearchSchema(20).extend({
    status: StaffStatusSchema.optional(),
    keyword: z.string().optional(),
})
export type UserSearch = z.infer<typeof userSearchSchema>
export type StaffSearch = z.infer<typeof staffSearchSchema>
