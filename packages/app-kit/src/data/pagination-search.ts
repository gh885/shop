import { z } from "zod"

export function createPaginationSearchSchema(defaultSize = 10) {
    return z.object({
        // oxlint-disable-next-line unicorn/prefer-top-level-await -- zod 的 .catch() 是解析兜底，非 Promise
        page: z.coerce.number().int().min(1).catch(1),
        // oxlint-disable-next-line unicorn/prefer-top-level-await -- zod 的 .catch() 是解析兜底，非 Promise
        size: z.coerce.number().int().min(1).catch(defaultSize),
    })
}

export const paginationSearchSchema = createPaginationSearchSchema()
