-- V62: 价格展示闸门 —— 划线价 ≥ 现价（skus 表上 ck_skus_original_price 非负闸门（V58）的同伴约束）

-- 0. 存量收敛：历史上抬现价不动划线价可能留下 original_price < price 的倒挂行。
--    抹平取「清空划线价」而不是抬高低的那边——划线价是展示性字段（PRD-39 可空=不画删除线），
--    去掉一条删除线优于篡改作为成交真相的 price。
UPDATE product.skus
SET original_price = NULL,
    updated_at = NOW()
WHERE original_price IS NOT NULL
  AND price IS NOT NULL
  AND original_price < price;

-- 1. 不变式：划线价为空（不画线）或 ≥ 现价；NULL 价格（草稿未定价）天然通过
ALTER TABLE product.skus
    ADD CONSTRAINT ck_skus_original_price_ge_price CHECK (original_price IS NULL OR original_price >= price);
