-- V55: 卖家售后工作台 —— 本店售后单按时间倒序分页（status 可选筛选）
--
-- 已有 idx_tickets_shop_status(shop_id, status) 只覆盖「按店 + 指定状态」，且不带排序；
-- 工作台默认不带状态（全部）且始终 created_at 倒序翻页，所以补一条覆盖该形状的复合索引。
-- 两条索引并存是有意的：待办 tab（带状态）走前者，全部 tab 走后者。

CREATE INDEX IF NOT EXISTS idx_tickets_shop_created ON aftersale.tickets(shop_id, created_at DESC);
