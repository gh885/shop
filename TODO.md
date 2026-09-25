# TODO

> **保鲜规则**：只放「进行中」和「马上要做」两栏；完成即删，不做规划池、不记历史（历史在 git log）。
> 超过一屏 = 该清理了。

## 近期要做

- [ ] 商详图库（Embla，约 45KB raw）挪出 `/welcome` 也加载的共享 chunk：`lazy` + 图库位骨架，属可感知行为变化，动前先按 docs/conventions/frontend.md「打包体积」量收益
- [ ] 搜索方案选型（当前 `name LIKE '%kw%'`，量级上去必须换，README「已知边界」已标注）
- [ ] ui-web 共享层两处（不要只改单个调用点）：① 单选行整行不可点（`Item` + `RadioGroupItem` 的
      行样式暗示可点，实际只有 16px 的圆点可点；结算地址选择、选券都是这个结构）——需要 `Item` 支持
      把行做成 label；② 状态徽章用 `variant="default"`（品牌橙实色）违反 DESIGN §0.3「品牌橙只留给
      转化引导」，应改用 subtle 弱底，涉及 `product/constants.ts`、`order/constants.ts`、`coupon/model.ts` 三处
