SET lock_timeout = '3s';
SET statement_timeout = '60s';

-- ─────────────────────────────────────────────────────────────────────────────
-- 买家收货地址簿。
--
-- 订单**不引用**这张表：下单时把选中地址完整快照进 trade 的 jsonb，改地址/删地址
-- 不影响任何历史订单——地址簿只是录入辅助，不是订单的外键来源。
-- 硬删：既然没人引用，软删只会白养一列、还让 20 条上限的计数多一层心智。
--
-- region_code 是国标 6 位区划码（运费模板按区县匹配的键）；province/city/district
-- 名称冗余展示。label 一列两用：内置枚举码（HOME/WORK/…）或自定义文案。
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE account.addresses
(
    id            uuid PRIMARY KEY DEFAULT uuidv7(),
    buyer_id      uuid         NOT NULL,
    receiver_name varchar(30)  NOT NULL,
    phone         varchar(20)  NOT NULL,
    region_code   varchar(12)  NOT NULL,
    province      varchar(30)  NOT NULL,
    city          varchar(30)  NOT NULL,
    district      varchar(30)  NOT NULL,
    detail        varchar(120) NOT NULL,
    label         varchar(20)  NOT NULL DEFAULT 'HOME',
    is_default    boolean      NOT NULL DEFAULT FALSE,
    created_at    timestamptz  NOT NULL DEFAULT now(),
    updated_at    timestamptz  NOT NULL DEFAULT now()
);

COMMENT ON TABLE account.addresses IS '买家收货地址簿；订单只取快照不取引用';
COMMENT ON COLUMN account.addresses.phone IS '收货联系电话，≠ 账号手机号，可代收；明文存，商家发货要用';
COMMENT ON COLUMN account.addresses.region_code IS '国标 6 位行政区划码；省(前2)市(前4)区(全6)三段码由它派生';

CREATE INDEX idx_addresses_buyer ON account.addresses (buyer_id);

-- 每个买家至多一个默认地址。服务层「先清后设」保证常规路径不撞它；
-- 并发写偏斜（两个请求同时清掉旧默认再各置一个新的）由这个索引兜底，撞上折成 409。
CREATE UNIQUE INDEX uk_addresses_default
    ON account.addresses (buyer_id)
    WHERE is_default;
