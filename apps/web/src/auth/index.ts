// `LoginDialog` 刻意不进桶：`__root.tsx` 按 `#/auth` 动态 import 它时，SiteHeader 那条静态
// `#/auth` 边会让 Rolldown 放弃切块（[INEFFECTIVE_DYNAMIC_IMPORT]），整条登录链留在首屏 index.js。
export { logout } from "./actions"
