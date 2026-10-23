SET lock_timeout = '3s';
SET statement_timeout = '60s';

-- ─────────────────────────────────────────────────────────────────────────────
-- 对账：把"账本自己说的"和"账本实际记的"比一遍，差异留痕，不抹平。
--
-- 三层对账里只做最便宜的一层（内部：分录 vs 余额缓存），另外两层要外部数据：
--   渠道层要对账单文件，三方层要清算与打款的回执。没有那两份数据源，写出来的"对账"
--   只能是假装对过——比不做更坏。
--
-- 这一版落三条检查，都是纯 SQL 能回答的：
--   1. 每个 posting_group 组内合计必须为 0（写入时 Ledger 已经拦了，这里防绕过 API 的写）
--   2. 每个币种全库合计必须为 0（复式记账的全局不变量）
--   3. account.balance 必须等于该账户所有分录之和（余额是缓存，分录是真相）
--
-- 注意：**差异不做任何自动调整**。第 1、2 条成立时账本是自洽的，第 3 条对不上只说明
-- 缓存被绕过写了；往 suspense 记一笔"调平"会把这个事实抹掉，那才是最坏的处理。
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE clearing.reconciliation_run
(
    id            uuid PRIMARY KEY DEFAULT uuidv7(),
    started_at    timestamptz NOT NULL,
    finished_at   timestamptz NOT NULL DEFAULT now(),
    broken        boolean     NOT NULL,
    group_count   integer     NOT NULL,
    entry_count   integer     NOT NULL,
    account_count integer     NOT NULL,

    -- 按检查项分组：{"kind": "...", "count": 12, "samples": [...]}
    -- samples 是截断后的样本（每项最多 20 条），count 是真实数量。
    -- 不存全量：一万个账户对不上时，把一万条塞进一个 jsonb 只会让这条记录本身查不动。
    findings      jsonb       NOT NULL DEFAULT '[]',

    CONSTRAINT ck_reconciliation_counts CHECK (
        group_count >= 0 AND entry_count >= 0 AND account_count >= 0)
);

COMMENT ON TABLE clearing.reconciliation_run IS
    '对账记录：一次一行，只追加；broken 为真说明发现了差异，findings 里是样本';
COMMENT ON COLUMN clearing.reconciliation_run.group_count IS '本次扫过的分录组数，用来判断"扫了多大范围"';
COMMENT ON COLUMN clearing.reconciliation_run.findings IS
    'jsonb [{kind, count, samples:[{subject, expected, actual}]}]；samples 截断，count 是真实数';

-- 看"最近几次跑得怎么样"是唯一的高频查询
CREATE INDEX idx_reconciliation_run_time ON clearing.reconciliation_run (started_at DESC);

-- 只查坏的那些：告警面板和排查都只关心它们
CREATE INDEX idx_reconciliation_run_broken ON clearing.reconciliation_run (started_at DESC) WHERE broken;

-- 对账记录本身也不许改。改一条记录等于改"当时账本是什么样"的证词。
CREATE TRIGGER trg_reconciliation_run_append_only
    BEFORE UPDATE OR DELETE
    ON clearing.reconciliation_run
    FOR EACH ROW
EXECUTE FUNCTION common.reject_mutation();

-- ── 查看对账的权限点 ────────────────────────────────────────────────────────
--
-- 归平台域，大写写法（CATEGORY_MANAGE / PROMOTION_MANAGE 一系）。
-- 只授 SUPER_ADMIN：对账报告会把"哪些账户的余额对不上"整页摊开，那是全平台的资金结构，
-- 不是运营日常要看的东西。等财务岗真的建起来，再把这一行改成授予那个岗位。
INSERT INTO common.permission (code, description) VALUES
    ('LEDGER_VIEW', '查看对账结果（差异项与余额重算）')
ON CONFLICT (code) DO NOTHING;

INSERT INTO staff.role_permission (role, permission_code)
SELECT 'SUPER_ADMIN', 'LEDGER_VIEW'
ON CONFLICT DO NOTHING;
