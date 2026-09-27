# TODO

> **保鲜规则**：只放「进行中」和「马上要做」两栏；完成即删，不做规划池、不记历史（历史在 git log）。
> 超过一屏 = 该清理了。

## 近期要做

- [ ] 买家评价：后端 `ReviewFlowIT`（提交/追评/回复/越权 404/窗口过期）与前端商详评价区、订单评价弹窗的 MSW 用例；图片那一格等买家上传通道（`/seller/**` 的图片凭证端点带店铺上下文，买家拿不到，契约与存储已备好）
- [ ] 操作审计：`AuditQueryServiceTest`（按操作人/对象/时间窗筛选、时间窗方向 400）、`AdminAuditControllerTest`（`AUDIT_VIEW` 判权）；导出那条（CSV 转义 + 二次确认）可留给前端用例
- [ ] 折扣券与相对有效期：`CouponFaceValue` 两段封顶的纯函数单测、结算链路折扣券实减额 IT（`CouponCommand.lock` 的封顶闸门）、建券条款 IT；`ReviewWindows.FOLLOW_UP_DAYS` 的窗口边界
- [ ] 封店/解封与员工岗位：`ShopAdminServiceTest`（末位超管不可降级/禁用、自指禁令、级联下架事件）、`StaffServiceTest`（建号工号唯一、岗位自指、末位保护）；管理端三个新页的 MSW 用例（审计筛选、物流处置、店铺封停/解封）
