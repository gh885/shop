# 管理操作审计查询

账号状态、优惠券作废和店铺审核已经通过 `BizEvent` 写入结构化事件：

- `account.status.changed`
- `staff.status.changed`
- `shop_review.decided`
- 优惠券作废当前使用 `[COUPON] 运营作废` 结构化日志

集中检索时按事件字段查询，不要从业务表当前状态反推历史操作：

```text
event = "account.status.changed" AND user_id = "<target-user-id>"
event = "staff.status.changed" AND staff_id = "<target-staff-id>"
event = "shop_review.decided" AND shop_id = "<target-shop-id>"
```

导出前必须二次确认；手机号只允许使用 `PhoneNumber.mask()` 结果，禁止导出明文。对象 ID、操作者 ID、状态和事件时间是必查字段，缺失记录应按日志采集故障处理，而不是补写到业务表。

后续若要提供管理端 UI 查询，优先给现有事件采集增加检索 API，不在业务模块新增一张与日志重复的审计表。
