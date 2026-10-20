import type { BannerRequest, BannerResponse } from "@shop/api/sdk"
import { withMaxLength } from "@shop/common/domain"
import { z } from "zod"

import { CMS_KEY_MAX, CMS_SUBTITLE_MAX, CMS_TITLE_MAX, CMS_URL_MAX } from "../constants"
import {
    blankToUndefined as blank,
    cmsErr,
    CmsTargetSortSchema,
    targetSortDefaults,
    toTargetSortFields,
} from "../form"
import { fromDateTimeLocal, toDateTimeLocal } from "#/shared/lib/datetime"

export const BannerFormSchema = z
    .object({
        slot: withMaxLength(
            z.string().trim().min(1, cmsErr("cms.form.err.slotRequired")),
            CMS_KEY_MAX,
        ),
        title: withMaxLength(
            z.string().trim().min(1, cmsErr("cms.form.err.titleRequired")),
            CMS_TITLE_MAX,
        ),
        subtitle: withMaxLength(z.string().trim(), CMS_SUBTITLE_MAX).optional(),
        imageUrl: withMaxLength(
            z.string().trim().min(1, cmsErr("cms.form.err.imageUrlRequired")),
            CMS_URL_MAX,
        ),
        link: withMaxLength(z.string().trim(), CMS_URL_MAX).optional(),
        startAt: z.string().optional(),
        endAt: z.string().optional(),
    })
    .merge(CmsTargetSortSchema)
    .refine((v) => !v.startAt || !v.endAt || v.endAt > v.startAt, {
        ...cmsErr("cms.form.err.endBeforeStart"),
        path: ["endAt"],
    })

export type BannerFormValues = z.infer<typeof BannerFormSchema>

export function bannerDefaults(banner?: BannerResponse, slot?: string): BannerFormValues {
    return {
        slot: banner?.slot ?? slot ?? "",
        title: banner?.title ?? "",
        subtitle: banner?.subtitle ?? "",
        imageUrl: banner?.imageUrl ?? "",
        link: banner?.link ?? "",
        startAt: toDateTimeLocal(banner?.startAt),
        endAt: toDateTimeLocal(banner?.endAt),
        ...targetSortDefaults(banner),
    }
}

export function toBannerRequest(v: BannerFormValues): BannerRequest {
    return {
        slot: v.slot.trim(),
        title: v.title.trim(),
        subtitle: blank(v.subtitle),
        imageUrl: v.imageUrl.trim(),
        link: blank(v.link),
        startAt: fromDateTimeLocal(v.startAt ?? ""),
        endAt: fromDateTimeLocal(v.endAt ?? ""),
        ...toTargetSortFields(v),
    }
}
