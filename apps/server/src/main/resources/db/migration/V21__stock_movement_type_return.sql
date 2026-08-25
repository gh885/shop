-- V21: Inventory — 流水新增 RETURN 类型（已付款订单取消/退款回补总库存）
-- 背景：已付款取消原记 RELEASE，但 RELEASE 口径约定 quantity=0（只换冻结/可用归属）；
-- 回补总库存 +n 与释放语义不符，独立成 RETURN 类型以保住「按 type 对账」的口径。
-- 类型全集：FREEZE 冻结 / CAPTURE 扣实 / RELEASE 释放（付款前取消、超时关单）/ RESTOCK 后台补货 / RETURN 已付款取消回补。

COMMENT ON COLUMN inventory.stock_movements.type IS 'FREEZE 冻结 / CAPTURE 扣实 / RELEASE 释放（付款前取消、超时关单）/ RESTOCK 后台补货 / RETURN 已付款取消回补';
COMMENT ON COLUMN inventory.stock_movements.order_id IS '关联订单 ID；FREEZE/CAPTURE/RELEASE/RETURN 必有，后台补货为 NULL';
