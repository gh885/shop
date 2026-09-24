-- V66: 售后退货物流列宽对齐 —— tickets.return_logistics_company 32 → 50
--
-- 买家回寄的快递公司名是手输原文（对不上字典就照实记），入参门是 @Size(max = 50)，
-- 与 shipments.carrier_name / orders.logistics_company 两处列宽一致；唯独这张表上的投影列建表时
-- 从旧 orders 列（V28）照搬了 VARCHAR(32)。33~50 字的名字因此过得了校验、写不进列：
-- 一个 value too long 的 500，而买家只是把面单上的公司全名照抄了一遍。
--
-- 加宽是纯 typmod 变更（varchar(32) → varchar(50) 不重写表、不锁行），无需存量收敛。

ALTER TABLE aftersale.tickets
    ALTER COLUMN return_logistics_company TYPE VARCHAR(50);
