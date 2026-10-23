SET lock_timeout = '3s';
SET statement_timeout = '60s';

-- ─────────────────────────────────────────────────────────────────────────────
-- 热路径缺的三个索引。都是"查询已经在线上跑、表会随数据涨"的补课，不改任何代码。
-- ─────────────────────────────────────────────────────────────────────────────

-- 结算反连接：DUE_MERCHANTS / DUE_ITEMS / SETTLE_ITEMS 三个查询每小时对每个待结算明细
-- 执行一次 NOT EXISTS，没有这个索引就是全表扫 freeze_item
CREATE INDEX idx_freeze_item_order
    ON clearing.freeze_item (seller_order_id)
    WHERE status = 'frozen';

-- 售后防重：AfterSaleService.apply 对每个订单行查 OPEN_CASE_OF_LINE，join 列是复合主键第二列
CREATE INDEX idx_case_item_order_line
    ON returns.case_item (order_line_id);

-- 审核队列：FIND_PENDING 按 status + submitted_at 过滤排序，pending 堆积时是全表扫 + 外排
CREATE INDEX idx_offer_pending_submitted
    ON catalog.offer (submitted_at)
    WHERE status = 'pending';
