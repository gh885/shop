SET lock_timeout = '3s';
SET statement_timeout = '60s';

-- ─────────────────────────────────────────────────────────────────────────────
-- 商家改库存的审计动作。
--
-- 库存是钱，但它不是金额账：`inventory.stock_ledger` 记的是每一件的进出，
-- 而"谁在什么时候把整张表格重填了一遍"这个动作只在 audit 里说得清。
-- 两条记录不重复：流水回答"账怎么变的"，审计回答"是谁按的按钮"。
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO audit.audit_action (action, subject, description) VALUES
    ('catalog.product.stock_adjusted', 'catalog', '商家调整商品库存（实物 / 安全库存）')
ON CONFLICT (action) DO NOTHING;
