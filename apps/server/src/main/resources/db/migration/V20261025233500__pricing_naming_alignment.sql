SET lock_timeout = '3s';
SET statement_timeout = '60s';

-- ─────────────────────────────────────────────────────────────────────────────
-- pricing 命名对齐：
--   price_quote.ship_address → shipping_address      与 trade 两层统一
--   price_quote_line.payable → payable_amount        与订单三层统一
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE pricing.price_quote RENAME COLUMN ship_address TO shipping_address;
ALTER TABLE pricing.price_quote_line RENAME COLUMN payable TO payable_amount;
