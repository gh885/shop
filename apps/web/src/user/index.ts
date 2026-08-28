/**
 * user —— 当前登录用户领域文件夹（扁形态：纯逻辑 + hook 内聚，无 entities/features/widgets 三层）。
 * - user.ts      ：纯类型 + wire → 投影（toCurrentUser），不碰 React/网络
 * - use-user.ts  ：React 接线（useMe / useClearMe）
 *
 * 桶文件只暴露外部真正消费的那几个；模块内部一律相对路径直连，不走这里。
 */

export { toCurrentUser, type CurrentUser } from "./user"
export { useMe, useClearMe } from "./use-user"
