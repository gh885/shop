/**
 * user —— 当前登录用户领域文件夹（扁形态：纯逻辑 + hook 内聚，无 entities/features/widgets 三层）。
 * - use-user.ts  ：React 接线（useMe / useClearMe），直接返回 SDK MeResponse
 *
 * 桶文件只暴露外部真正消费的那几个；模块内部一律相对路径直连，不走这里。
 */

export { useMe, useClearMe } from "./use-user"
