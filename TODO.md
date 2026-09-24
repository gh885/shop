# TODO

> **保鲜规则**：只放「进行中」和「马上要做」两栏；完成即删，不做规划池、不记历史（历史在 git log）。
> 超过一屏 = 该清理了。

## 近期要做

- [ ] E2E：Playwright 接入，先覆盖一条下单主路径（真实后端，storageState 缓存登录态）
- [ ] admin 运营入口两处（C 档端点已就绪、页面缺）：① 用户/员工列表查询端点 + 封号管理页（PATCH status 已挂在 `AdminAccountController`，缺可发现的列表来源）；② 按用户/店铺查券列表端点 + 作废入口（`POST /admin/coupons/{id}/void` 暂借 CMS_MANAGE，落地时换独立 COUPON_OPS 权限码）
- [ ] CI：现有远端门禁（前端 lint/typecheck/test + 后端 compile + 契约审计）上补 `mvn verify`（需给 job 配 PG + Redis 服务）与 Playwright
- [ ] 商详图库（Embla，约 45KB raw）挪出 `/welcome` 也加载的共享 chunk：`lazy` + 图库位骨架，属可感知行为变化，动前先按 docs/conventions/frontend.md「打包体积」量收益
- [ ] 搜索方案选型（当前 `name LIKE '%kw%'`，量级上去必须换，README「已知边界」已标注）
- [ ] ui-web 共享层两处（不要只改单个调用点）：① 单选行整行不可点（`Item` + `RadioGroupItem` 的
      行样式暗示可点，实际只有 16px 的圆点可点；结算地址选择、选券都是这个结构）——需要 `Item` 支持
      把行做成 label；② 状态徽章用 `variant="default"`（品牌橙实色）违反 DESIGN §0.3「品牌橙只留给
      转化引导」，应改用 subtle 弱底，涉及 `product/constants.ts`、`order/constants.ts`、`coupon/model.ts` 三处
- [ ] V66（回寄公司名 32 → 50）尚未在任何库上跑过：那道闸门（`FieldRuleVocabularyTest`）是无库能跑的静态核对，
      写迁移的人当时没起 datastore。下次拉起本地库时 Flyway 会自动补上，之后这条即可删；在那之前本地仍会
      在「回寄公司填过 32 字」时吃 500
