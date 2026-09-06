# TODO

> **保鲜规则**：只放「进行中」和「马上要做」两栏；完成即删，不做规划池、不记历史（历史在 git log）。
> 超过一屏 = 该清理了。

## 进行中

- [ ] 工作区未提交改动收尾（`git status` 里那批：toast 迁移 ui-web、`use-order-actions`、`ProductImage`、`format.ts`、seller/admin 页面改动）
- [ ] App 目录结构迁移：先把约定落进 AGENTS.md（顶层 layout/routes/shared/{domain}、domain 内文件名即分层、依赖方向与 index.ts 公开入口、domain 目录名 = 路由顶层段），再把 `widgets/`、`features/` 并入 domain，统一 product/products 命名错位

## 近期要做

- [ ] E2E：Playwright 接入，先覆盖一条下单主路径（真实后端，storageState 缓存登录态）
- [ ] seller/admin 首批测试用例（vitest 配置与装置已就绪，`passWithNoTests` 摘除时机 = 有了第一个用例）
- [ ] CI：GitHub Actions 跑 lint + typecheck + vitest + `mvn verify` + Playwright（本地 lefthook 已覆盖大部分，补远端门禁）
- [ ] 搜索方案选型（当前 `name LIKE '%kw%'`，量级上去必须换，README「已知边界」已标注）
