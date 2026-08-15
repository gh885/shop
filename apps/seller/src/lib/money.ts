/** 金额工具：后端价格字段一律为「分」（Long），表单与展示层用「元」 */

/** 分 → 展示用元（如 29900 → "299.00"）；null 占位 */
export function fenToYuan(fen: number | null | undefined): string {
    if (fen === null || fen === undefined) return '—';
    return (fen / 100).toFixed(2);
}

/** 元输入（字符串）→ 分；非法输入返回 null 由调用方拦截 */
export function yuanToFen(yuan: string): number | null {
    const value = Number(yuan);
    if (!yuan.trim() || Number.isNaN(value) || value < 0) return null;
    return Math.round(value * 100);
}

/** 价格区间展示：单规格同价时只显示一个价 */
export function priceRangeText(min: number | null, max: number | null): string {
    if (min === null || min === undefined) return '未定价';
    if (max === null || max === undefined || max === min) return `¥${fenToYuan(min)}`;
    return `¥${fenToYuan(min)} ~ ¥${fenToYuan(max)}`;
}
