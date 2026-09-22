-- V63: 七天无理由退货落地（消保法第 25 条）—— 商品声明 + 订单快照 + 售后原因枚举与强制标记
--
-- 背景：AFS-20 写着「无七天无理由概念，卖家可任意拒绝」，法定权利缺位的根因是**判定不了**：
-- 售后理由是一段自由文本（AFS-10），「无理由」和「质量不好」在库里长得一样，系统无从知道
-- 买家主张的是哪一种权利；商品侧也没有任何「本商品支持无理由退货」的说法，特殊类目除外
-- （消保法第 25 条第 2 款）无处表达。三样东西一起补，缺一都判不成。
--
--   * product.products.seven_day_return：卖家的声明，默认支持（法条默认就是支持，除外要由卖家说明）。
--     本期只在上新/编辑基本信息时可改；类目级默认名单（生鲜/定作/在线下载…）等有平台侧维护入口再说
--   * orders.items.seven_day_return：下单瞬间的快照，与 name/price/image 同款理由——
--     卖家事后关掉开关不该抹掉买家买到时手上的权利。判定读快照，不读商品当前值
--   * aftersale.tickets.reason_code：申请原因枚举（可空：V63 之前的历史单无从考证，不为它编一个原因）
--   * aftersale.tickets.no_reason_enforced：本单是否成立「无理由强制」（卖家不得拒绝）。
--     申请瞬间定格而不是每次现算：七天窗口从签收起算，卖家拖到窗口外是常态，
--     现算等于「买家合法主张、卖家拖一拖就能反悔」——权利在申请那一刻成立，不随处理时长失效

ALTER TABLE product.products
    ADD COLUMN IF NOT EXISTS seven_day_return BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN product.products.seven_day_return IS '是否支持七天无理由退货（消保法第 25 条）；FALSE = 属法定除外商品';

ALTER TABLE orders.items
    ADD COLUMN IF NOT EXISTS seven_day_return BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN orders.items.seven_day_return IS '下单瞬间的商品无理由退货声明快照；售后判定只读它，不读 SPU 当前值';

ALTER TABLE aftersale.tickets
    ADD COLUMN IF NOT EXISTS reason_code VARCHAR(32),
    ADD COLUMN IF NOT EXISTS no_reason_enforced BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN aftersale.tickets.reason_code IS '申请原因枚举（AfterSaleReason）；V63 前的历史单为 NULL，不补编';
COMMENT ON COLUMN aftersale.tickets.no_reason_enforced IS '无理由强制单：申请时成立（原因=无理由 + 快照支持 + 签收后 7 天内），卖家侧不下发拒绝动作';

-- 取值集的唯一真相在 aftersale.model.AfterSaleReason，此处只同步（显式命名，理由见 V32 头注释）
ALTER TABLE aftersale.tickets
    ADD CONSTRAINT ck_tickets_reason_code
    CHECK (reason_code IS NULL OR reason_code IN ('NO_REASON', 'QUALITY_ISSUE', 'NOT_AS_DESCRIBED', 'DAMAGED',
                                                  'WRONG_ITEM', 'MISSING_ITEM', 'OTHER'));
