import { CMS_KEY_MAX } from "#/cms/constants"
import { z } from "zod"

export const bannerSearchSchema = z.object({
    slot: z.string().trim().min(1).max(CMS_KEY_MAX).optional(),
})
