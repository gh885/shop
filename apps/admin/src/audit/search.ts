import { createPaginationSearchSchema } from "@shop/app-kit/data"
import { z } from "zod"
import {
    AUDIT_ACTION_MAX,
    AUDIT_PAGE_SIZE,
    AUDIT_TARGET_ID_MAX,
    AUDIT_TARGET_TYPE_MAX,
} from "./constants"

export const auditSearchSchema = createPaginationSearchSchema(AUDIT_PAGE_SIZE).extend({
    operatorId: z.string().uuid().optional(),
    targetType: z.string().max(AUDIT_TARGET_TYPE_MAX).optional(),
    targetId: z.string().max(AUDIT_TARGET_ID_MAX).optional(),
    action: z.string().max(AUDIT_ACTION_MAX).optional(),
    from: z.string().optional(),
    to: z.string().optional(),
})
export type AuditSearch = z.infer<typeof auditSearchSchema>
