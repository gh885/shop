import { ErrorCodes, toApiError, type ApiError } from "@shop/common/contract"
// 前端不判词，只解析后端 400 的结构；不从中文 detail 正则捞（判据在后端，词表是运营数据、前端抄一份会漂移）

export type ForbiddenField = "name" | "subtitle"

export type ForbiddenWordFound = { field: ForbiddenField; word?: string }

export type ForbiddenHit = { field: ForbiddenField; message: string }

const isForbiddenField = (field: string): field is ForbiddenField =>
    field === "name" || field === "subtitle"

// undefined=非此码（按普通错误处理）；null=命中但字段不属本表单（只给全局提示）；否则=字段+词
export function parseForbiddenWordError(error: unknown): ForbiddenWordFound | null | undefined {
    const apiError: ApiError = toApiError(error)
    if (apiError.code !== ErrorCodes.FORBIDDEN_WORD_HIT) {
        return undefined
    }
    // 用 for 逐条判不用 find：find 不收窄 field 成 ForbiddenField，会放过认不出的字段
    for (const item of apiError.errors ?? []) {
        if (isForbiddenField(item.field)) return { field: item.field, word: item.value }
    }
    return null
}
