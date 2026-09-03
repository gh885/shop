-- V36: 商品状态语义扩展 —— 下架(OFF) 更名为 仓库中(WAREHOUSE)
--
-- 仓库中是「不在售但填完了」的汇聚态，容纳两类商品：
--   ① 填完但主动选择放入仓库（草稿 → 仓库中，见 publish target=WAREHOUSE）
--   ② 上架后下架（上架 → 仓库中）
-- 上架/草稿不变；仅把存量字面量 OFF 迁移为 WAREHOUSE，并更新 CHECK 约束。

-- ===== product 模块 =====

-- 存量数据先改名（否则在 CHECK 约束更新前插入/更新会因旧值不在新集合而失败）
UPDATE product.products SET status = 'WAREHOUSE' WHERE status = 'OFF';

-- 状态集合：OFF → WAREHOUSE（草稿/上架不变）。存量已迁移，约束收紧为不含 OFF。
ALTER TABLE product.products DROP CONSTRAINT IF EXISTS chk_products_status;
ALTER TABLE product.products
    ADD CONSTRAINT chk_products_status CHECK (status IN ('PUBLISHED', 'DRAFT', 'WAREHOUSE'));
