# TODO

> **保鲜规则**：只放「进行中」和「马上要做」两栏；完成即删，不做规划池、不记历史（历史在 git log）。
> 超过一屏 = 该清理了。

## 近期要做

- [ ] 后端补一条：售后申请时若该订单已有 REFUNDED 单则拒绝（V1 只挡「进行中」，重复退款敞着口）
- [ ] E2E：Playwright 接入，先覆盖一条下单主路径（真实后端，storageState 缓存登录态）
- [ ] admin 首批测试用例（vitest 装置已就绪，`passWithNoTests` 摘除时机 = 有了第一个用例；
      seller 已摘，首个用例是 `apps/seller/src/order/list/ship-dialog.test.tsx`）
- [ ] CI：GitHub Actions 跑 lint + typecheck + vitest + `mvn verify` + Playwright（本地 lefthook 已覆盖大部分，补远端门禁）
- [ ] 搜索方案选型（当前 `name LIKE '%kw%'`，量级上去必须换，README「已知边界」已标注）
