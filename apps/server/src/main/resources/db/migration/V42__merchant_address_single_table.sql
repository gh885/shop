-- V42: 商家地址简化为「单表 + 用途标记」模型（对齐淘宝地址库：一条地址 = 默认发货/默认退货两个布尔 + 公司名称）
-- 背景：先前的 address + address_roles 双表 + role_type 枚举是对「一址多角色共享」的过度抽象；
-- 实际只有发货/退货两种用途、一个地址可同时承担两者，两个布尔即可表达，面单寄件人由 company_name（公司名称）承载。
-- 本迁移从 address_roles 回填默认标记后删除角色表（新库也按 V40→V41→V42 顺序得到正确终态）。

-- 1) 地址本体新增字段：公司名称（面单寄件人）、备注、默认发货/默认退货标记
ALTER TABLE merchant_address.addresses
    ADD COLUMN company_name VARCHAR(60),                     -- 地址所属公司名称（面单寄件人）
    ADD COLUMN note         VARCHAR(200),                    -- 备注（店铺/仓库备注等）
    ADD COLUMN default_ship BOOLEAN NOT NULL DEFAULT FALSE,  -- 默认发货地址
    ADD COLUMN default_return BOOLEAN NOT NULL DEFAULT FALSE; -- 默认退货地址

-- 2) 回填：SHIP_FROM 角色默认 → 默认发货；RETURN_TO 角色默认 → 默认退货（旧角色表存在时才有数据）
UPDATE merchant_address.addresses a
SET default_ship = EXISTS (SELECT 1 FROM merchant_address.address_roles r
        WHERE r.address_id = a.id AND r.role_type = 'SHIP_FROM' AND r.is_default AND r.enabled)
WHERE a.deleted_at IS NULL;

UPDATE merchant_address.addresses a
SET default_return = EXISTS (SELECT 1 FROM merchant_address.address_roles r
        WHERE r.address_id = a.id AND r.role_type = 'RETURN_TO' AND r.is_default AND r.enabled)
WHERE a.deleted_at IS NULL;

-- 3) 删除角色表（含其索引；地址表自身索引保留，见下方重建）
DROP TABLE IF EXISTS merchant_address.address_roles;

-- 4) 每店至多一个默认发货 / 默认退货（部分唯一索引，只约束未删且为默认的行）
CREATE UNIQUE INDEX IF NOT EXISTS uk_addresses_default_ship ON merchant_address.addresses(shop_id)
    WHERE default_ship = TRUE AND deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uk_addresses_default_return ON merchant_address.addresses(shop_id)
    WHERE default_return = TRUE AND deleted_at IS NULL;

-- 5) 订单表「面单寄件人」列改名为公司名称口径：shipper_entity_name → shipper_company_name
ALTER TABLE orders.orders RENAME COLUMN shipper_entity_name TO shipper_company_name;
