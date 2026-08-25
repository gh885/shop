-- V20: Inventory — 流水补全总库存前后视点
-- 背景：V19 的 stock_movements 只记可用量前后（before/after_available），CAPTURE 时可用量不变导致账面
-- 丢失"总库存 -n"这一笔。本迁移补齐 总库存(frozen_stock) 前后两列，使每笔变更可完整重放：
--   quantity = 总库存增量（after - before）；before/after_stock = 总库存前后；before/after_available = 可用量前后。
-- 口径约束：FREEZE/RELEASE 总库存不变（quantity=0，只换冻结/可用归属）；CAPTURE 总库存 -n；RESTOCK 总库存 +n。
-- 历史行（V19 期间写入）无总库存快照，before/after_stock 置 NULL 表示不可考；新写入必填。

ALTER TABLE inventory.stock_movements
    ADD COLUMN before_stock  INT,
    ADD COLUMN after_stock   INT;

-- 历史行回填（近似）：可按旧列可用量反推，但冻结量时任不可考；保守置 NULL 避免错误数据。
-- 对账从 V20 起强制完整（新行必填前后总库存）。
COMMENT ON COLUMN inventory.stock_movements.before_stock IS '操作前总库存（stock）；历史行可空表示不可考';
COMMENT ON COLUMN inventory.stock_movements.after_stock IS '操作后总库存（stock）';
