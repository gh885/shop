/** 本域常量（纯数据）：排序词表。判定与投影在 rules.ts，wire→视图在 mapper.ts */

/**
 * 排序方式（与后端 `ProductQuery.sort` 的 `@Pattern` 对齐，非法值后端 400）。
 *
 * 那格在契约里是 `@Pattern("newest|price_asc|price_desc")` 而不是 enum，前端拿不到结构化的词表
 * （TS 也切不开一个字面量类型），所以它与契约是否相等由 `rules.test.ts` 断言。
 */
export const PRODUCT_SORT_VALUES = ["newest", "price_asc", "price_desc"] as const

export type ProductSort = (typeof PRODUCT_SORT_VALUES)[number]
