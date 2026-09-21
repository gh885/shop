-- V61: 开店闸门 —— 店名全局唯一（拍板：一人一店；数量闸门在 service 侧，见 ShopService.createShop）
-- shops 不做物理删除、没有软删列（状态只有 PENDING_REVIEW/ACTIVE/REJECTED/DISABLED 四态），
-- 所以唯一性作用于全表：被拒/被封店铺的名字仍占位——与 service 预检同口径（全表查名字，不看状态）。

-- 0. 存量收敛：dev 库历史上允许重名店（建店时只跑过 V8 的无约束 DDL）。同名只保留最早创建的一家，
--    其余在名尾追加 '-#' + id 前 8 位十六进制消重：id 全局唯一故消重后必不重名；
--    left(name, 39) 截断保证结果 ≤ 49 字符，不撑爆 VARCHAR(50)。
UPDATE shop.shops
SET name = left(name, 39) || '-#' || substr(replace(id::text, '-', ''), 1, 8),
    updated_at = NOW()
WHERE id IN (
    SELECT id FROM (
        SELECT id, row_number() OVER (PARTITION BY name ORDER BY created_at, id) AS rn
        FROM shop.shops
    ) dup
    WHERE dup.rn > 1
);

-- 1. 店名全局唯一：先查后插挡不住并发，唯一索引才是真相；撞键由 service 兜成 400 SHOP_NAME_TAKEN
CREATE UNIQUE INDEX IF NOT EXISTS uk_shops_name ON shop.shops(name);
