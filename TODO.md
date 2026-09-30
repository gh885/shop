# TODO

> **保鲜规则**：只放「进行中」和「马上要做」两栏；完成即删，不做规划池、不记历史（历史在 git log）。
> 超过一屏 = 该清理了。

## 近期要做

- [ ] 买家评价：后端 `ReviewFlowIT`（提交/追评/回复/越权 404/窗口过期）与前端商详评价区、订单评价弹窗的 MSW 用例；图片那一格等买家上传通道（`/seller/**` 的图片凭证端点带店铺上下文，买家拿不到，契约与存储已备好）
- [ ] i18n P0′ 架构收口（清单在 [docs/conventions/i18n.md](docs/conventions/i18n.md) §9，排在铺 222 个文件的硬编码中文之前）：**已落** —— 换 `intl-messageformat`、`APP_KIT_MESSAGES` 与三端 `common.json` 落成 glob 覆盖的资源文件、codegen `scripts/i18n-codegen.mjs` 产 `MessageKey`/`Catalog`/`ParamsOf`/`Translate` 并接进 `i18n:drift` + lefthook `i18n-drift` + CI `i18n`（四条判据逐条成立，10 类变异验过，见 §5.5/§10.1）、**三端调用侧类型化**（4b：各端 `src/locales/use-t.ts` 把生成物那份 `XTranslate` 接到 `useT()` 上，`t(key, params)` 变成编译期判定，断言只有 `useTypedT` 一处；未走 Provider 泛型化的理由与两条已量过的口子见 §5.5 末）、**删掉进程级 locale**（`getCurrentLocale`/`setCurrentLocale` 已无，`format*`/`translateAppKit`/`notify.fromError` 收必填 locale，模块级表格 cell 走 `<TimeText>`，非组件消费者读装配注入的 `localeScope`，交错请求测已翻回正向断言，见 §3.5/§7.1）。**还欠** —— `error-messages.ts` 进 catalog、`ui-web` 55 个文件的内嵌中文 labels 化。旧脚本 `scripts/i18n-check.mjs` 与 `pnpm i18n:check` **已删**：删之前补上了一件欠账——本文与 §5.5 契约 3 都声称 lefthook pre-push 有 `i18n-drift` 作业，实际从来没有（drift 只在 CI 跑），判据 3 的「自动执行」当时只成立一半；作业补进 `lefthook.yml` 独立 job（不塞 `verify`，那条按指纹缓存重放）后四条判据才逐条有落点，删除动作这才排上。`notify.ts` 的 `detail` 兜底退出条件也记在这格——① 每个 code 恰有一条 `error.<code>` 的反向门禁转绿，② 生产代码渲染 detail 的分支清零，两条都成立才删兜底（判据改版见 AGENTS.md「错误码规范」）。SSR 那半仍然欠着：web 的 `localeScope` 是进程级一份，服务端按请求解析语言归 P3′-a
- [ ] 操作审计：`AuditQueryServiceTest`（按操作人/对象/时间窗筛选、时间窗方向 400）、`AdminAuditControllerTest`（`AUDIT_VIEW` 判权）；导出那条（CSV 转义 + 二次确认）可留给前端用例
- [ ] 折扣券与相对有效期：`CouponFaceValue` 两段封顶的纯函数单测、结算链路折扣券实减额 IT（`CouponCommand.lock` 的封顶闸门）、建券条款 IT；`ReviewWindows.FOLLOW_UP_DAYS` 的窗口边界
- [ ] 补测零覆盖的高复杂函数（`pnpm test:coverage && pnpm fallow:health` 出清单）。已修（重构部分已收口，`fallow audit` 零发现）：`coupon/form.ts` 两处拆成两型各自的 refine/投影、`sdk-client.ts` 错误归一化、`ui-web/image.tsx` 圆角/加载属性共用、`use-product-draft.ts` 落库编排搬进 `draft-persist.ts` 再拆成身份/回填/快照/两个写通道共 6 个子 hook、`BasicStep` 拆出分区体与表单/提交 hook、买家主链路页面组件按职责拆开（`checkout.tsx` 三态壳 + 左栏 + 金额卡（金额小计归到 `#/checkout` 的 `checkoutTotals`）+ 提交 hook、`pay/$orderId.tsx` 五个 phase 各归一个组件、`logistics/$orderId.tsx` 拆摘要/轨迹轴/降级查询 hook、`orders/$orderId.tsx` 弹窗状态收进 `useDialogs`、左主区独立成组件、`PurchasePanel` 拆标题/价格/承诺/规格、`Gallery` 抽出 `useLensPreview` 与缩略图/舞台/页签、`OrderCard` 拆头/行/底栏/提示行）。cc/cog 全部退出 fallow 复杂度榜，剩下的只有「函数级覆盖率为 0」导致的 CRAP 信号（`pnpm test:coverage` 补用例即可降）
- [ ] 封店/解封与员工岗位：`ShopAdminServiceTest`（封店状态码口径、级联下架事件、解封的店主账号闸门）、`StaffServiceTest`（建号工号唯一、岗位自指禁令）；管理端三个新页的 MSW 用例（审计筛选、物流处置、店铺封停/解封）。末位超管保护已由 `StaffGovernanceIT` 覆盖（含并发）

## 下一步功能候选（拍板一个挪上「近期要做」一个）

- [ ] 站内消息体系（淘宝对标 P1「通知」，全站级最大缺口）：站内信表 + 买卖双方读取端 + 订单/售后/物流关键节点的写入点；物流异常「平台主动提示买家」（LOG-33 半解项）与封号/审核结果通知都等这个通道
- [ ] 正向包裹修改运单号/承运商（对标 LOG-10「卖家动作」行，录错只能追加包裹、轨迹全错）：放开全局唯一 + 不可改约束做成限时可改边，连带订单摘要与轨迹重拉
- [ ] 违禁词闸门接评价与售后凭证文本（COM-01 的 P2 接线，词表与出口已备好）：评价内容、售后凭证说明走 `ForbiddenWordCommand` 同一条同步调用，运营改词表的写后失效缓存一并补上
- [ ] 平台违规下架到单品/类目粒度（对标「平台治理」剩一半，现只有整店级联 PRD-83）：可复用 `ShopTradingSuspendedEvent` 的级联 + 审计同事务模式
- [ ] 售后凭证上传 + 仅退款金额可改（对标 P1）：卡在同一前置——买家侧图片上传通道（与评价图片格合并成一件事）
