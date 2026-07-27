import { z } from 'zod';

/** 后端统一错误响应 */
export const ApiErrorSchema = z.object({
    title: z.string().optional(),
    status: z.number(),
    detail: z.string(),
    code: z.string().optional(),
    requestId: z.string().optional(),
    errors: z
        .array(
            z.object({
                field: z.string(),
                message: z.string(),
            }),
        )
        .optional(),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

/** 后端统一成功响应元信息 */
export const ApiMetaSchema = z.object({
    requestId: z.string(),
    timestamp: z.string(),
});

/** 后端统一成功响应包装（data + meta） */
export function ApiResponseSchema<T extends z.ZodTypeAny>(dataSchema: T) {
    return z.object({
        data: dataSchema,
        meta: ApiMetaSchema,
    });
}
