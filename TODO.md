# TODO

> **保鲜规则**：只放「进行中」和「马上要做」两栏；完成即删，不做规划池、不记历史（历史在 git log）。
> 超过一屏 = 该清理了。

## 近期要做

- [ ] 后端补一条：售后申请时若该订单已有 REFUNDED 单则拒绝（V1 只挡「进行中」，重复退款敞着口）
- [ ] E2E：Playwright 接入，先覆盖一条下单主路径（真实后端，storageState 缓存登录态）
- [ ] CI：GitHub Actions 跑 lint + typecheck + vitest + `mvn verify` + Playwright（本地 lefthook 已覆盖大部分，补远端门禁）
- [ ] 搜索方案选型（当前 `name LIKE '%kw%'`，量级上去必须换，README「已知边界」已标注）
- [ ] ui-web 共享层两处（不要只改单个调用点）：① 单选行整行不可点（`Item` + `RadioGroupItem` 的
      行样式暗示可点，实际只有 16px 的圆点可点；结算地址选择、选券都是这个结构）——需要 `Item` 支持
      把行做成 label；② 状态徽章用 `variant="default"`（品牌橙实色）违反 DESIGN §0.3「品牌橙只留给
      转化引导」，应改用 subtle 弱底，涉及 `product/constants.ts`、`order/constants.ts`、`coupon/model.ts` 三处
