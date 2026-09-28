# TODO

> **保鲜规则**：只放「进行中」和「马上要做」两栏；完成即删，不做规划池、不记历史（历史在 git log）。
> 超过一屏 = 该清理了。

## 近期要做

- [ ] 买家评价：后端 `ReviewFlowIT`（提交/追评/回复/越权 404/窗口过期）与前端商详评价区、订单评价弹窗的 MSW 用例；图片那一格等买家上传通道（`/seller/**` 的图片凭证端点带店铺上下文，买家拿不到，契约与存储已备好）
- [ ] 操作审计：`AuditQueryServiceTest`（按操作人/对象/时间窗筛选、时间窗方向 400）、`AdminAuditControllerTest`（`AUDIT_VIEW` 判权）；导出那条（CSV 转义 + 二次确认）可留给前端用例
- [ ] 折扣券与相对有效期：`CouponFaceValue` 两段封顶的纯函数单测、结算链路折扣券实减额 IT（`CouponCommand.lock` 的封顶闸门）、建券条款 IT；`ReviewWindows.FOLLOW_UP_DAYS` 的窗口边界
- [ ] 补测零覆盖的高复杂函数（`pnpm test:coverage && pnpm fallow:health` 出清单）。已修：`coupon/form.ts` 两处拆成两型各自的 refine/投影、`sdk-client.ts` 错误归一化、`ui-web/image.tsx` 圆角/加载属性共用、`use-product-draft.ts` 落库编排搬进 `draft-persist.ts`（cog 17 卡在 hook 密度上）。剩余待拆：买家下单/支付/物流主链路的页面组件（`checkout.tsx` CheckoutPage cc12/cog20、`pay/$orderId.tsx` PayPage、`logistics/$orderId.tsx` LogisticsPage、`orders/$orderId.tsx` OrderDetailPage、详情页 `PurchasePanel`/`Gallery`/`OrderCard`）函数级覆盖率为 0；`useProductDraft`/`BasicStep.tsx` 的 cog 17/21 靠拆子 hook（hook 密度）而非拆函数
- [ ] 封店/解封与员工岗位：`ShopAdminServiceTest`（封店状态码口径、级联下架事件、解封的店主账号闸门）、`StaffServiceTest`（建号工号唯一、岗位自指禁令）；管理端三个新页的 MSW 用例（审计筛选、物流处置、店铺封停/解封）。末位超管保护已由 `StaffGovernanceIT` 覆盖（含并发）

## 下一步功能候选（拍板一个挪上「近期要做」一个）

- [ ] 站内消息体系（淘宝对标 P1「通知」，全站级最大缺口）：站内信表 + 买卖双方读取端 + 订单/售后/物流关键节点的写入点；物流异常「平台主动提示买家」（LOG-33 半解项）与封号/审核结果通知都等这个通道
- [ ] 正向包裹修改运单号/承运商（对标 LOG-10「卖家动作」行，录错只能追加包裹、轨迹全错）：放开全局唯一 + 不可改约束做成限时可改边，连带订单摘要与轨迹重拉
- [ ] 违禁词检测（对标合规 P1）：词表 + 商品标题/详情发布闸门先行，评价与售后凭证文本复用同一出口
- [ ] 买家延长收货（对标 ORD-28 缺口，P2 但很薄）：一次性 +N 天的端点，重算自动确认时刻
- [ ] 平台违规下架到单品/类目粒度（对标「平台治理」剩一半，现只有整店级联 PRD-83）：可复用 `ShopTradingSuspendedEvent` 的级联 + 审计同事务模式
- [ ] 售后凭证上传 + 仅退款金额可改（对标 P1）：卡在同一前置——买家侧图片上传通道（与评价图片格合并成一件事）
