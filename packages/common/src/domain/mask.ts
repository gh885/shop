/**
 * 掩码形状的唯一前端出口（GEN-51 前端半边），与后端 `PhoneNumber.mask()` 同为「前 3 + 掩码段 + 后 4」。前端只持形状常量（供 ui-web 的零依赖副本对值），不做脱敏计算——手机号在 wire 上由后端掩好（`maskPhone` 已随消费点退场删除）。
 */

/** 掩码段：「这是不是掩码」的判断也用它。ui-web 那份零依赖副本由 shared-vocabulary 门禁钉同值 */
export const MASK_SEGMENT = "****"
