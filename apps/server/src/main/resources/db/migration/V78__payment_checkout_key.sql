-- V78: Payment 模块 — payments 增加结算归组键 checkout_key
-- 一次多店结算拆出的 N 张单要能在收银台合并成一次支付：N 条流水共享同一 checkout_key（= orders.orders.checkout_key），
-- 发起时按 key 逐单复用/补建 PENDING，确认时按 key 整批 PENDING→SUCCESS + 逐单 markPaid（同事务、任一单被取消整批回滚）。
-- 单店/来自订单列表的逐单支付不写这一列（NULL），仍走 order_id 维度的既有一单一成功流水幂等索引。
--
-- 迁移级超时：本文件只有一条普通 DDL（ADD COLUMN 可空无默认，PG 走元数据级快操作，但按口径照样带超时）。
-- 配套索引走 CONCURRENTLY、单独放 V79——它不能和本文件的 SET 混在一个文件（Flyway 的 mixed 检查会报错，理由见 V76/V77 头部）。
SET lock_timeout = '5s';
SET statement_timeout = '60s';

ALTER TABLE payment.payments ADD COLUMN IF NOT EXISTS checkout_key UUID;
