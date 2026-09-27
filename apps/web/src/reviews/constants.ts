/** 评价域的展示常量 */

/** 商详评价区每页条数：评价是「看前几条 + 翻页」的列表，10 条一屏能读完 */
export const REVIEW_PAGE_SIZE = 10

/** 星级 → 展示文案（1~5，DB CHECK 与入参 @Min/@Max 同值） */
export const RATING_LABEL: Record<number, string> = {
    1: "很差",
    2: "较差",
    3: "一般",
    4: "满意",
    5: "非常满意",
}
