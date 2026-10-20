SET lock_timeout = '3s';
SET statement_timeout = '60s';

-- ─────────────────────────────────────────────────────────────────────────────
-- 资金账务的地基：账户 / 分录组 / 分录
--
-- 形状与不变量见 docs/domain/ledger.md。三条硬约束在这里落地：
--   1. 分录只追加（触发器拦 UPDATE/DELETE）
--   2. 同一分录组的金额合计恒为 0（Java 侧校验，见 Ledger）
--   3. 幂等靠 posting_group.biz_no 唯一
-- ─────────────────────────────────────────────────────────────────────────────

CREATE SCHEMA IF NOT EXISTS clearing;

COMMENT ON SCHEMA clearing IS '清算与账务；金额一律 bigint 存分，不出现浮点';

-- 谁的钱。balance 是缓存不是真相源：真相是所有 ledger_entry 的累计，
-- 日终任务用分录重算一遍再跟这里比对，不一致就报警。
CREATE TABLE clearing.account
(
    id           uuid PRIMARY KEY DEFAULT uuidv7(),
    owner_type   text        NOT NULL,
    owner_id     uuid        NOT NULL,
    account_type text        NOT NULL,
    currency     char(3)     NOT NULL,
    balance      bigint      NOT NULL DEFAULT 0,
    created_at   timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT uq_account_owner UNIQUE (owner_type, owner_id, account_type, currency),
    CONSTRAINT ck_account_owner_type CHECK (owner_type IN ('buyer', 'merchant', 'platform', 'channel', 'subsidy')),
    CONSTRAINT ck_account_type CHECK (account_type IN ('available', 'pending', 'frozen', 'deposit', 'suspense'))
);

COMMENT ON TABLE clearing.account IS '资金账户；余额是分录的缓存，可随时重算';
COMMENT ON COLUMN clearing.account.owner_id IS '平台/渠道级账户用全零 UUID 占位。不能为 NULL——NULL 在唯一约束里互不相等，约束会悄悄失效';
COMMENT ON COLUMN clearing.account.balance IS '缓存值，单位分；真相源是 ledger_entry';

-- 一笔业务。biz_no 唯一，这就是幂等键：重复提交撞这里，不重复记账。
CREATE TABLE clearing.posting_group
(
    id          uuid PRIMARY KEY DEFAULT uuidv7(),
    biz_type    text        NOT NULL,
    biz_no      text        NOT NULL,
    currency    char(3)     NOT NULL,
    occurred_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT uq_posting_group_biz_no UNIQUE (biz_no)
);

COMMENT ON TABLE clearing.posting_group IS '分录组：一笔业务对应一组分录，组内金额合计必须为 0';
COMMENT ON COLUMN clearing.posting_group.biz_no IS '幂等键，形如 <业务类型>:<业务号>:<动作>:<序号>；冲正用原号 + :reversal';

-- 分录。amount 带符号：正数余额增加，负数减少。
-- 不设借贷两列，用「组内和为 0」表达复式——能一条 SQL 校验，而借贷要靠人看。
CREATE TABLE clearing.ledger_entry
(
    id         uuid PRIMARY KEY DEFAULT uuidv7(),
    group_id   uuid        NOT NULL,
    account_id uuid        NOT NULL,
    amount     bigint      NOT NULL,
    biz_date   date        NOT NULL,
    posted_at  timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT ck_ledger_entry_amount CHECK (amount <> 0)
);

COMMENT ON TABLE clearing.ledger_entry IS '分录：只追加，不改不删；全库按币种合计恒为 0';
COMMENT ON COLUMN clearing.ledger_entry.amount IS '带符号，单位分；同一 group_id 下合计必须为 0';
COMMENT ON COLUMN clearing.ledger_entry.biz_date IS '账期归属日，与 posted_at（记账时刻）分开，跨天补单时不会落错月';

-- 余额重算与按账户查流水都走这个
CREATE INDEX idx_ledger_entry_account ON clearing.ledger_entry (account_id, posted_at);

-- 按组回查（冲正、对账）
CREATE INDEX idx_ledger_entry_group ON clearing.ledger_entry (group_id);

-- 只追加护栏。应用账号即使就是表属主，也改不了已记的账——
-- 纠错只能开反向分录，这是资金侧唯一允许的纠错方式。
CREATE TRIGGER trg_ledger_entry_append_only
    BEFORE UPDATE OR DELETE
    ON clearing.ledger_entry
    FOR EACH ROW
EXECUTE FUNCTION common.reject_mutation();

CREATE TRIGGER trg_posting_group_append_only
    BEFORE UPDATE OR DELETE
    ON clearing.posting_group
    FOR EACH ROW
EXECUTE FUNCTION common.reject_mutation();
