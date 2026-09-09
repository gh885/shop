-- V46: 商家地址并入 Shop 模块 —— merchant_address.addresses 迁到 shop schema（模块 = 顶层包 = schema）
-- 商家发货/退货地址是店铺的履约属性，单独成 address 模块只换来一个多余的 schema 与一条 order → address 依赖。
-- 表结构与索引原样搬（SET SCHEMA 连索引一起走）；代码侧 MerchantAddress* 进 shop 包，快照读查询进 shop :: api。

ALTER TABLE merchant_address.addresses SET SCHEMA shop;
DROP SCHEMA merchant_address;
