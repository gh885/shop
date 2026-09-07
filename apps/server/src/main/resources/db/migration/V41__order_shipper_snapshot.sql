-- V41: Order 模块 — orders 表新增「发货快照」列（与收货快照同哲学：发货时刻定格，之后改地址库不影响已发货单）
-- shipper 前缀区分买方（receiver_*）与卖方（shipper_*）；shipper_entity_name 为面单寄件人名称（履约主体）

ALTER TABLE orders.orders ADD COLUMN shipper_contact_name VARCHAR(30);
ALTER TABLE orders.orders ADD COLUMN shipper_phone       VARCHAR(20);
ALTER TABLE orders.orders ADD COLUMN shipper_province    VARCHAR(30);
ALTER TABLE orders.orders ADD COLUMN shipper_city        VARCHAR(30);
ALTER TABLE orders.orders ADD COLUMN shipper_district    VARCHAR(30);
ALTER TABLE orders.orders ADD COLUMN shipper_detail      VARCHAR(120);
ALTER TABLE orders.orders ADD COLUMN shipper_entity_name VARCHAR(60);
