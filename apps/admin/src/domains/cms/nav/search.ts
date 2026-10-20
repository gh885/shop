import { CMS_KEY_MAX } from "#/domains/cms/constants"
import { z } from "zod"

export const navSearchSchema = z.object({
    navKey: z.string().trim().min(1).max(CMS_KEY_MAX).optional(),
})
