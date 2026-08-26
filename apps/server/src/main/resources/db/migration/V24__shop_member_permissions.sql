-- V24: 权限系统 P1 —— 店铺成员可授予权限集（docs/permission-implementation.md「权限码表」）
-- 可授予白名单收敛在代码（shop/service/SellerGrants）：{PRODUCT_MANAGE, ORDER_FULFILL}；
-- MEMBER_MANAGE / SHOP_MANAGE 是 OWNER 固有，不进此列。OWNER 全权由角色判定，不依赖本列。

ALTER TABLE shop.shop_members ADD COLUMN permissions JSONB NOT NULL DEFAULT '[]';
