-- V85: 退款单接管售后 —— 批次④
--
-- 目标模型见 docs/domain/order-model.md §4.5 / §5.4 / §8（2026-10-18 定案）。V81 已经建好退款三表，
-- 但服务层仍跑在 V47 的售后工单（tickets + ticket_events）上：整单退、无行数量、无执行记录、无重试。
-- 本次把工单表与订单上的两列售后投影一起退役，让退款单成为售后的唯一聚合。
--
-- 为什么删列而不是留作兼容：售后单状态与退款单状态是两套词表（APPLYING/RETURNING vs PENDING/AGREED/…），
-- 前后并存就得写一份映射，而映射的每一格都是「哪边算真相」的歧义。直接删，写入口随之收敛到一处。
--
-- 新增列各有用处，不是预留：
--   * reason_code / no_reason_enforced —— 七天无理由强制（AFS-45）。工单时代这两列在 tickets 上，
--     随单据一起搬过来：判定读「申请那一刻」的主张与快照，事后现算会随卖家处理时长漂移。
--   * reject_reason —— 拒绝理由（AFS-30/44）。工单时代它睡在 ticket_events.note 上，靠一张只读一行的
--     时间线接口取回；退款单没有时间线表，理由就是这一行的事实，单独一列成本更低、语义更直。
--   * agreed_at / return_registered_at —— 两条超时的计时起点（AFS-23）。工单时代取 MAX(事件时刻)，
--     退款单没有事件表；寄回单号可重复提交覆盖（AFS-41），所以 `return_registered_at` 每次覆盖写。
--   * refund_lines.active —— 「同一订单行至多一张未完结退款单」（§8 退款单闸门）的 DB 级闸门。
--     未完结是父单状态上的属性，跨表做不到部分唯一索引，故在行上冗余一个标记：退款单到终态
--     （REFUNDED / REJECTED / CANCELLED）时把它的行标记为 false，失败单保持 true（重试期内仍算未完结）。
--     并发两笔申请同时插入同一订单行时，后到者撞 uk_refund_lines_open_item → 409，不靠先查后插。

ALTER TABLE aftersale.refunds
    ADD COLUMN reason_code VARCHAR(32),
    ADD COLUMN no_reason_enforced BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN reject_reason VARCHAR(200),
    ADD COLUMN agreed_at TIMESTAMPTZ,
    ADD COLUMN return_registered_at TIMESTAMPTZ;

-- 取值集的唯一真相在 aftersale.model.AfterSaleReason，此处只同步（显式命名，理由见 V32 头注释）
ALTER TABLE aftersale.refunds
    ADD CONSTRAINT ck_refunds_reason_code
    CHECK (reason_code IS NULL OR reason_code IN ('NO_REASON', 'QUALITY_ISSUE', 'NOT_AS_DESCRIBED', 'DAMAGED',
                                                  'WRONG_ITEM', 'MISSING_ITEM', 'OTHER'));

COMMENT ON COLUMN aftersale.refunds.reason_code IS '申请原因枚举（AfterSaleReason）；判定只吃枚举，自由文本在 reason';
COMMENT ON COLUMN aftersale.refunds.no_reason_enforced IS '七天无理由强制单：申请时定格，卖家在待处理阶段不得拒绝（AFS-45）';
COMMENT ON COLUMN aftersale.refunds.reject_reason IS '拒绝理由：拒绝是终态，理由只写一次（AFS-30/44）';
COMMENT ON COLUMN aftersale.refunds.agreed_at IS '卖家同意时刻：买家回寄窗口（7 天）的计时起点（AFS-23）';
COMMENT ON COLUMN aftersale.refunds.return_registered_at IS '最近一次回寄登记时刻：可重复提交覆盖，卖家收货窗口（10 天）的计时起点（AFS-41）';

-- 待收货扫描：只装「退款中」单，按更新时间取头部；失败重试也走这条线
CREATE INDEX IF NOT EXISTS idx_refunds_refunding
    ON aftersale.refunds(updated_at) WHERE status = 'REFUNDING';

ALTER TABLE aftersale.refund_lines
    ADD COLUMN active BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN aftersale.refund_lines.active IS '未完结闸门标记：父单到终态（已退款/已拒绝/已撤销）时置 false，失败单保持 true（重试期内仍算未完结）';

CREATE UNIQUE INDEX uk_refund_lines_open_item
    ON aftersale.refund_lines(order_item_id) WHERE line_type = 'ITEM' AND active;

-- ============================================================================
-- 订单 / 主订单：售后角标投影（§5.4）
-- ============================================================================
--
-- 角标是展示态（退款中 / 已退款 / 已补偿），算它需要读退款单；订单列表在 order 模块里分页，
-- 不能反向查 aftersale 的 schema，所以由 aftersale 每次退款状态变化后经 order :: api 写回。
-- 与主进度（V84 视图）的分工：主进度只读订单自己的状态，故能在库里算；角标依赖他模块的退款状态，
-- 只能由知道真相的一方写回，两件事因此落点不同。

ALTER TABLE orders.orders
    ADD COLUMN after_sale_badge VARCHAR(20) NOT NULL DEFAULT 'NONE'
    CHECK (after_sale_badge IN ('NONE', 'REFUNDING', 'REFUNDED', 'COMPENSATED')),
    DROP COLUMN after_sale_status,
    DROP COLUMN refund_amount;

COMMENT ON COLUMN orders.orders.after_sale_badge IS '售后角标（§5.4）：NONE/REFUNDING/REFUNDED/COMPENSATED，aftersale 经 order :: api 写回';

ALTER TABLE orders.trades
    ADD COLUMN after_sale_badge VARCHAR(20) NOT NULL DEFAULT 'NONE'
    CHECK (after_sale_badge IN ('NONE', 'REFUNDING', 'REFUNDED', 'COMPENSATED'));

COMMENT ON COLUMN orders.trades.after_sale_badge IS '主订单级售后角标（§5.4）：主订单下任一子订单有未完结退款即退款中；refund_amount 汇总口径见 refunded_amount';

-- ============================================================================
-- 退役：售后工单与时间线
-- ============================================================================
DROP TABLE IF EXISTS aftersale.ticket_events;
DROP TABLE IF EXISTS aftersale.tickets;
