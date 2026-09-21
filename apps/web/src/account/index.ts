/**
 * account —— 我的账号领域文件夹（对应路由 /account/*；后端数据在 /user/*）：
 * - queries.ts ：当前登录用户数据层（useMe / useClearMe）+ 登录设备（devicesOptions / deviceKeys）
 *
 * 桶文件只暴露外部真正消费的那几个；模块内部一律相对路径直连，不走这里。
 * 页头不在这里：账号页页头与其它内页同构，用 #/shared/ui/SearchHeader。
 */

export { useMe, useClearMe, devicesOptions, deviceKeys } from "./queries"
