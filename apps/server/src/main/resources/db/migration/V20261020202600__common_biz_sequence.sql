-- 全库第一条迁移。它同时定下三件事：schema 怎么分、文件头怎么写、发号表长什么样。
SET lock_timeout = '3s';
SET statement_timeout = '60s';

CREATE SCHEMA IF NOT EXISTS common;

COMMENT ON SCHEMA common IS '不归属任何业务模块的基础设施表；业务模块各自一个同名 schema';

-- 连续号段发号表。只服务「不能有空号」的号：凭证编号、发票号、对账单号。
--
-- 为什么不用 PG 的 SEQUENCE：sequence 的值在事务回滚时不回退，必然留下空号。
-- 这是一行普通数据，更新和业务写在同一个事务里，回滚就一起回滚，号才连续。
--
-- 为什么高频号不能用它：同一 (ns, period) 上的写会串行排队。订单号那类走应用层
-- 本地随机生成（BizNo），允许空号。
CREATE TABLE common.biz_sequence
(
    ns         text        NOT NULL,
    period     text        NOT NULL,
    last_value bigint      NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT pk_biz_sequence PRIMARY KEY (ns, period),
    CONSTRAINT ck_biz_sequence_last_value CHECK (last_value > 0)
);

COMMENT ON TABLE common.biz_sequence IS '连续号段发号表；period 是业务周期（如 yyyyMMdd），不分周期的写空串';
COMMENT ON COLUMN common.biz_sequence.ns IS '命名空间，例如 voucher / invoice / reconciliation';
COMMENT ON COLUMN common.biz_sequence.last_value IS '已发出的最大号；下一个号是 last_value + 1';
