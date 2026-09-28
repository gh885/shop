-- V73: Compliance 模块 —— 违禁词表（COM-01）
-- 动机：商品标题/卖点、评价、售后凭证都是买家与卖家互相看得见的公开文本，此前没有任何内容闸门：
--       违规内容只能在用户举报后走下架，属于事后补救。发布前拦一道是把处置成本从「平台工时 + 店铺处罚」
--       降到「卖家自己改一次文案」。
--
-- 设计取舍：
--   * 词表独立成表而不是塞进 application.yml：违禁词要能被运营增删（新品类黑话、时效性词），改配置要重启；
--     表是数据，改一行就生效。种子给一份起步词表，真正的运营入口在 P2（admin 词表管理页）。
--   * 只存「词」不存「规则」：本轮不做正则/通配/上下文豁免（那会把误杀面放大到不可预期），
--     命中判定与大小写/全半角归一全部收在代码里的纯函数（ForbiddenWordMatcher），
--     词表列只负责「有哪些词」，将来加规则是加列而不是改口径。
--   * 命中存 matched_word：闸门拒绝时要告诉卖家**哪个词**被拦了，只说「含违禁词」卖家无从下手。
--   * 不加软删除列：停用一个词 = 删一行，命中历史不追溯（审计另走 audit :: api）。
--
-- 分类：分类只用于给卖家一个可行动的提示（「标题含广告法违禁词」比「标题含违禁词」有用），
--       不参与命中判定——同一列不做两件事。

CREATE SCHEMA IF NOT EXISTS compliance;

CREATE TABLE IF NOT EXISTS compliance.forbidden_words (
    id          UUID PRIMARY KEY DEFAULT uuidv7(),
    word        TEXT        NOT NULL,
    category    TEXT        NOT NULL,
    enabled     BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT ck_forbidden_words_word_not_blank CHECK (length(btrim(word)) > 0),
    CONSTRAINT ck_forbidden_words_category CHECK (category IN ('AD_LAW', 'FRAUD', 'PORN', 'POLITICS', 'INFRINGEMENT', 'OTHER'))
);

-- 查闸门要走的整集：只取启用的词。唯一索引让「同一个词不重复登记」（人工维护时最容易犯的错）
-- 全篇带 IF NOT EXISTS / ON CONFLICT：本地库改这份注释会让 checksum 变了要重放，重放必须无副作用
CREATE UNIQUE INDEX IF NOT EXISTS uk_forbidden_words_word ON compliance.forbidden_words (word);
CREATE INDEX IF NOT EXISTS idx_forbidden_words_enabled ON compliance.forbidden_words (enabled) WHERE enabled;

COMMENT ON TABLE compliance.forbidden_words IS '违禁词表（COM-01）：商品/评价/售后凭证的公开文本闸门，发布前拦截';
COMMENT ON COLUMN compliance.forbidden_words.word IS '词本身（判定时大小写与全半角归一，见 ForbiddenWordMatcher）';
COMMENT ON COLUMN compliance.forbidden_words.category IS '分类，只用于给卖家可行动的提示，不参与命中判定';

-- 起步词表：覆盖六类里最常被滥用的词，够跑通闸门；运营口径以平台公告为准，后续在 admin 增删。
-- ON CONFLICT DO NOTHING：词已被运营删过/改过的不复活、不覆盖，重放只补空缺
INSERT INTO compliance.forbidden_words (id, word, category) VALUES
    ('01900000-0000-4000-8000-0000000000a1', '最佳', 'AD_LAW'),
    ('01900000-0000-4000-8000-0000000000a2', '第一', 'AD_LAW'),
    ('01900000-0000-4000-8000-0000000000a3', '国家级', 'AD_LAW'),
    ('01900000-0000-4000-8000-0000000000a4', '顶级', 'AD_LAW'),
    ('01900000-0000-4000-8000-0000000000a5', '100%有效', 'AD_LAW'),
    ('01900000-0000-4000-8000-0000000000a6', '永久有效', 'AD_LAW'),
    ('01900000-0000-4000-8000-0000000000a7', '包治', 'AD_LAW'),
    ('01900000-0000-4000-8000-0000000000b1', '假一赔十', 'FRAUD'),
    ('01900000-0000-4000-8000-0000000000b2', '刷单', 'FRAUD'),
    ('01900000-0000-4000-8000-0000000000b3', '代购正品', 'FRAUD'),
    ('01900000-0000-4000-8000-0000000000b4', '走私', 'FRAUD'),
    ('01900000-0000-4000-8000-0000000000c1', '色情', 'PORN'),
    ('01900000-0000-4000-8000-0000000000c2', '裸聊', 'PORN'),
    ('01900000-0000-4000-8000-0000000000d1', '办证', 'OTHER'),
    ('01900000-0000-4000-8000-0000000000d2', '发票代开', 'OTHER'),
    ('01900000-0000-4000-8000-0000000000e1', '高仿', 'INFRINGEMENT'),
    ('01900000-0000-4000-8000-0000000000e2', '山寨', 'INFRINGEMENT')
ON CONFLICT (word) DO NOTHING;
