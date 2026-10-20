/** 本域常量（纯数据）：空选择集哨兵。业务函数在 rules.ts，出文案的函数在 display.ts */

/** 空选择集：作为默认值与「全不选」的返回值，共享同一个不可变实例 */
export const EMPTY_SELECTION: ReadonlySet<string> = new Set()
