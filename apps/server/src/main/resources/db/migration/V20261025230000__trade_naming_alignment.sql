SET lock_timeout = '3s';
SET statement_timeout = '60s';

-- ─────────────────────────────────────────────────────────────────────────────
-- trade 命名对齐（上线前一次性 RENAME，只改名不改形状）：
--   close_reason → closed_reason    与 closed_at 时态一致，子单本就叫 closed_reason
--   expire_at → expires_at          与 price_quote / reservation 统一（主语是单数行）
--   ship_address → shipping_address 全称，行业惯用 shipping address
--   order_line.payable → payable_amount   与 order_group / seller_order 统一
--   order_event.actor_* → operator_*      与 audit_log / 安全层词汇统一（operator=操作者）
-- 索引名随列走。
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE trade.order_group RENAME COLUMN close_reason TO closed_reason;
ALTER TABLE trade.order_group RENAME COLUMN expire_at TO expires_at;
ALTER TABLE trade.order_group RENAME COLUMN ship_address TO shipping_address;
ALTER TABLE trade.seller_order RENAME COLUMN ship_address TO shipping_address;
ALTER TABLE trade.order_line RENAME COLUMN payable TO payable_amount;
ALTER TABLE trade.order_event RENAME COLUMN actor_type TO operator_type;
ALTER TABLE trade.order_event RENAME COLUMN actor_id TO operator_id;

ALTER INDEX trade.idx_order_group_unpaid_expire RENAME TO idx_order_group_unpaid_expires;
