# TODO

> **保鲜规则**：只放「进行中」和「马上要做」两栏；完成即删，不做规划池、不记历史（历史在 git log）。
> 超过一屏 = 该清理了。

## 近期要做

- [ ] 买家评价：后端 `ReviewFlowIT`（提交/追评/回复/越权 404/窗口过期）与前端商详评价区、订单评价弹窗的 MSW 用例；图片那一格等买家上传通道（`/seller/**` 的图片凭证端点带店铺上下文，买家拿不到，契约与存储已备好）
- [ ] i18n 铺文案（§9 P1/P2 的正事）。**口径先量准**：剥注释 + 排除测试/import 后，三端生产代码还有 **web 66 文件 / seller 58 / admin 66，合计约 1230 行**用户可见中文（本轮从 1570 降到这里：web 626→369、seller 524→450）。
      文档与旧笔记里「ui-web 55 个文件」「222 个文件」是在**数注释**——ui-web 的用户可见中文已由 `81c1dce0` 清零，不要再按那个数排期。
      **已落**：券规则句（common 只给结构化事实，`{rate}` 槽位由 app 按 locale 选十分位/百分比）、web 订单域（44 条；`OrderActionItem` 去掉 `label` 字段、选项表从模块级搬进组件、`ORDER_STATUS_TABS` 收成 `OrderTab[]`）、订单详情卡（20 条）、入驻页+欢迎页（两个静态落地页）、结算页+收银台（39 条）、评价弹窗（24 条）、搜索页+购物车工具栏（30 条）、物流轨迹词表与订单侧事件（18 条）、订单卡+售后卡（28 条）、seller 运费模板页与地区多选（33 条）、建券弹窗字段名与提示（23 条）、店铺管理页（29 条）、admin `category/attr-panel` 纯字面量 JSX（30 条，进新建的 `category.json`）、**`statusOptions` 那条共用机制收口：新建 `statusOptionsFromKeys`（common，`Record<码值, key|{labelKey}>`→`{value,labelKey}[]`，保住穷尽性、写错 key 编译不过）+ `localizeStatusOptions`（app-kit，键表+`t`→`{value,label}`；Tab 类渲染点直接 `t(labelKey)` 不经过它），照 seller `order` 样板推广到 admin `account`/`audit`/`cms`/`shop-ops`/`shop-review`/`coupon-ops` 与 seller `product` 各 badge/下拉表，web+admin 共用的 `COUPON_STATUS_META` 按 Option A 拆成买家/运营各一张键表（common 只留 `USER_COUPON_STATUSES` 码事实），旧 `statusOptions`/`Labelled`/`labelOf` 已删。admin `category/attr-panel` 的 `ATTR_KIND_LABEL`/`ATTR_STATUS_LABEL`/`ATTR_VALUE_SOURCE_LABEL` 改键表（`admin.category.{kind,attrStatus,source}.*`）、`ATTR_KIND_OPTIONS` 走 `statusOptionsFromKeys`+`localizeStatusOptions`、`describeAttrRules(attr, t)`（片段进 `admin.category.rules.*`，`t` 作参按 §3.5）、`kindLocked` 句 `{kind}` 插值；seller `coupon/form.ts` 的 `COUPON_TYPE_ITEMS` 改键表（`seller.coupon.type.*`，走 `statusOptionsFromKeys`+`localizeStatusOptions`；顺带删掉那个从不渲染的死 `description` 字段），全部门禁绿**。
      **判据（每批照此拆）**：换语言会不会变——变的进 catalog，不变的留 `constants.ts`；每张查表保持 `Record<码值, key>` 保住穷尽性。
      **下一批**（`statusOptions` 已收口，下面都不再被那道机制挡）：各处 `constants.ts` 剩余的表头/列名/JSX 字面量。
      另：**Zod schema 期校验消息**（不是 `t()` 调用，处置方式与 JSX 文案不同，需全仓第一个「吃 `t` 的 schema 工厂」：`makeXSchema(t)` + 渲染点 `useMemo`，`CouponFormValues` 之类改从 `ReturnType` 取）——欠着的是 seller `coupon/form.ts`（`yuanField`/四个 `refine*`/`CouponFormSchema` 那十来条）与 `address/AddressFormDialog`（`address-form.ts`）。这批开工时顺带定这套工厂口径，之后各域照抄。
      英文文案**全部是拟稿待产品评审**（coupon / 订单 / 落地页 / 物流 / 运费五批）。
- [ ] 补测零覆盖的高复杂函数（`pnpm test:coverage && pnpm fallow:health` 出清单）。已修（重构部分已收口，`fallow audit` 零发现）：`coupon/form.ts` 两处拆成两型各自的 refine/投影、`sdk-client.ts` 错误归一化、`ui-web/image.tsx` 圆角/加载属性共用、`use-product-draft.ts` 落库编排搬进 `draft-persist.ts` 再拆成身份/回填/快照/两个写通道共 6 个子 hook、`BasicStep` 拆出分区体与表单/提交 hook、买家主链路页面组件按职责拆开（`checkout.tsx` 三态壳 + 左栏 + 金额卡（金额小计归到 `#/checkout` 的 `checkoutTotals`）+ 提交 hook、`pay/$orderId.tsx` 五个 phase 各归一个组件、`logistics/$orderId.tsx` 拆摘要/轨迹轴/降级查询 hook、`orders/$orderId.tsx` 弹窗状态收进 `useDialogs`、左主区独立成组件、`PurchasePanel` 拆标题/价格/承诺/规格、`Gallery` 抽出 `useLensPreview` 与缩略图/舞台/页签、`OrderCard` 拆头/行/底栏/提示行）。cc/cog 全部退出 fallow 复杂度榜，剩下的只有「函数级覆盖率为 0」导致的 CRAP 信号（`pnpm test:coverage` 补用例即可降）

## 下一步功能候选（拍板一个挪上「近期要做」一个）

- [ ] 站内消息体系（淘宝对标 P1「通知」，全站级最大缺口）：站内信表 + 买卖双方读取端 + 订单/售后/物流关键节点的写入点；物流异常「平台主动提示买家」（LOG-33 半解项）与封号/审核结果通知都等这个通道
- [ ] 正向包裹修改运单号/承运商（对标 LOG-10「卖家动作」行，录错只能追加包裹、轨迹全错）：放开全局唯一 + 不可改约束做成限时可改边，连带订单摘要与轨迹重拉
- [ ] 违禁词闸门接评价与售后凭证文本（COM-01 的 P2 接线，词表与出口已备好）：评价内容、售后凭证说明走 `ForbiddenWordCommand` 同一条同步调用，运营改词表的写后失效缓存一并补上
- [ ] 平台违规下架到单品/类目粒度（对标「平台治理」剩一半，现只有整店级联 PRD-83）：可复用 `ShopTradingSuspendedEvent` 的级联 + 审计同事务模式
- [ ] 售后凭证上传 + 仅退款金额可改（对标 P1）：卡在同一前置——买家侧图片上传通道（与评价图片格合并成一件事）
- [ ] 操作审计导出：CSV 转义（防注入）+ 二次确认，读侧复用现有 `AuditQueryService`；端点与前端两半都还没建，属新功能
