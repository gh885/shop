import type { BannerRequest, BannerResponse } from "@shop/api/sdk"
import { z } from "zod"

import {
    blankToUndefined as blank,
    fromDateTimeLocal,
    parseTargetType,
    submitTargetType,
    TargetTypeSchema,
    toDateTimeLocal,
} from "../constants"

/** banner 表单值（datetime-local 字符串态；提交时投影成 BannerRequest 的 ISO） */
export const BannerFormSchema = z
    .object({
        slot: z.string().trim().min(1, "请输入运营位").max(32),
        title: z.string().trim().min(1, "请输入标题").max(64),
        subtitle: z.string().trim().max(128).optional(),
        imageUrl: z.string().trim().min(1, "请输入图片地址").max(512),
        targetType: TargetTypeSchema.or(z.literal("NONE")).optional(),
        target: z.string().trim().max(255).optional(),
        link: z.string().trim().max(512).optional(),
        sortOrder: z.string().trim().regex(/^\d*$/, "排序需为非负整数"),
        startAt: z.string().optional(),
        endAt: z.string().optional(),
    })
    .refine((v) => !v.startAt || !v.endAt || v.endAt > v.startAt, {
        message: "下线时间需晚于上线时间",
        path: ["endAt"],
    })

export type BannerFormValues = z.infer<typeof BannerFormSchema>

export function bannerDefaults(banner?: BannerResponse, slot?: string): BannerFormValues {
    return {
        slot: banner?.slot ?? slot ?? "",
        title: banner?.title ?? "",
        subtitle: banner?.subtitle ?? "",
        imageUrl: banner?.imageUrl ?? "",
        targetType: parseTargetType(banner?.targetType),
        target: banner?.target ?? "",
        link: banner?.link ?? "",
        sortOrder: String(banner?.sortOrder ?? 0),
        startAt: toDateTimeLocal(banner?.startAt),
        endAt: toDateTimeLocal(banner?.endAt),
    }
}

export function toBannerRequest(v: BannerFormValues): BannerRequest {
    return {
        slot: v.slot.trim(),
        title: v.title.trim(),
        subtitle: blank(v.subtitle),
        imageUrl: v.imageUrl.trim(),
        targetType: submitTargetType(v.targetType),
        target: blank(v.target),
        link: blank(v.link),
        sortOrder: v.sortOrder ? Number(v.sortOrder) : 0,
        startAt: fromDateTimeLocal(v.startAt ?? ""),
        endAt: fromDateTimeLocal(v.endAt ?? ""),
    }
}
