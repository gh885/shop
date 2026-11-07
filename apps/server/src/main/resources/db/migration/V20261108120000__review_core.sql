SET lock_timeout = '3s';
SET statement_timeout = '60s';

-- ─────────────────────────────────────────────────────────────────────────────
-- 评价：一行一评 + 一次性追评 + 商家一次回复，聚合成一张可变行。
--
-- pending 行由 OrderCompleted 事件按订单行预生成（含商品快照，展示不回查别的模块）；
-- 买家提交后变 published；平台可 hidden。窗口 15 天不默认好评（京东口径）。
-- UGC 行是买家写操作的留痕本身，不挂审计、不挂只追加触发器（追评/回复要原位补写）。
-- ─────────────────────────────────────────────────────────────────────────────

CREATE SCHEMA IF NOT EXISTS review;

COMMENT ON SCHEMA review IS '评价：买家对已完结订单行的公开反馈；UGC，可随时清空重建';

CREATE TABLE review.review
(
    id               uuid PRIMARY KEY DEFAULT uuidv7(),
    order_group_id   uuid        NOT NULL,
    seller_order_id  uuid        NOT NULL,
    order_line_id    uuid        NOT NULL,
    line_no          integer     NOT NULL,
    buyer_id         uuid        NOT NULL,
    buyer_name       text        NOT NULL DEFAULT '',
    merchant_id      uuid        NOT NULL,
    shop_id          uuid        NOT NULL,
    spu_id           uuid        NOT NULL,
    sku_id           uuid        NOT NULL,
    title            text        NOT NULL,
    image_url        text,
    spec_values      jsonb,
    status           text        NOT NULL DEFAULT 'pending',
    overall          integer,
    desc_score       integer,
    service_score    integer,
    logistics_score  integer,
    content          text,
    images           jsonb       NOT NULL DEFAULT '[]',
    anonymous        boolean     NOT NULL DEFAULT false,
    content2         text,
    images2          jsonb       NOT NULL DEFAULT '[]',
    appended_at      timestamptz,
    reply_content    text,
    reply_at         timestamptz,
    reviewable_until timestamptz NOT NULL,
    reviewed_at      timestamptz,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),

    -- 一行一评：评的是订单行，不是订单也不是 SKU 实例
    CONSTRAINT uq_review_line UNIQUE (order_line_id),
    CONSTRAINT ck_review_status CHECK (status IN ('pending', 'published', 'hidden')),
    -- pending 就该是空评价、有分就不是 pending：两个方向都不许出现半提交状态
    CONSTRAINT ck_review_state CHECK ((status = 'pending') = (overall IS NULL)),
    CONSTRAINT ck_review_overall CHECK (overall IS NULL OR overall BETWEEN 1 AND 5),
    CONSTRAINT ck_review_desc CHECK (desc_score IS NULL OR desc_score BETWEEN 1 AND 5),
    CONSTRAINT ck_review_service CHECK (service_score IS NULL OR service_score BETWEEN 1 AND 5),
    CONSTRAINT ck_review_logistics CHECK (logistics_score IS NULL OR logistics_score BETWEEN 1 AND 5),
    CONSTRAINT ck_review_content CHECK (content IS NULL OR char_length(content) <= 500),
    CONSTRAINT ck_review_content2 CHECK (content2 IS NULL OR char_length(content2) <= 500),
    -- 图片是 media key 数组，九张封顶（淘宝口径）
    CONSTRAINT ck_review_images CHECK (jsonb_typeof(images) = 'array' AND jsonb_array_length(images) <= 9),
    CONSTRAINT ck_review_images2 CHECK (jsonb_typeof(images2) = 'array' AND jsonb_array_length(images2) <= 9),
    -- 追评与回复只能落在已发布过的行上（hidden 行允许保留既有的追评/回复）
    CONSTRAINT ck_review_append CHECK (content2 IS NULL OR status IN ('published', 'hidden')),
    CONSTRAINT ck_review_reply CHECK (reply_content IS NULL OR status IN ('published', 'hidden')),
    CONSTRAINT ck_review_reviewed CHECK ((status = 'pending') = (reviewed_at IS NULL))
);

COMMENT ON TABLE review.review IS '评价聚合行：pending（待评，事件预生成）→ published（已评）→ hidden（平台处置）';
COMMENT ON COLUMN review.review.order_line_id IS '一行一评的锚点；订单行自带商品快照，评价落库时再快照一份展示字段';
COMMENT ON COLUMN review.review.buyer_name IS '提交时快照的买家昵称；公开列表展示前脱敏（首字 + **），匿名行不展示';
COMMENT ON COLUMN review.review.spec_values IS '下单时的规格快照（jsonb），评价卡「买的是哪个规格」就靠它';
COMMENT ON COLUMN review.review.overall IS '总体评分 1-5 星；pending 行为 NULL，提交时与 status 一起 CAS 写入';
COMMENT ON COLUMN review.review.desc_score IS '描述相符 1-5；可空——淘宝 DSR 三维里本仓库暂只采集不聚合（无店铺页）';
COMMENT ON COLUMN review.review.images IS '评价图片的 media key 数组，最多 9 张';
COMMENT ON COLUMN review.review.content2 IS '追评一次；90 天窗口由服务层按 reviewed_at 判';
COMMENT ON COLUMN review.review.reply_content IS '商家回复一次；CAS 守卫 IS NULL，对主评或追评均可';
COMMENT ON COLUMN review.review.reviewable_until IS '可评价截止 = 订单完结 + 窗口；过期自然关闭，不做默认好评';
COMMENT ON COLUMN review.review.status IS 'pending 待评 / published 已评 / hidden 平台隐藏（卖家不可见不可回复）';

-- 待评价列表（买家私有读，SQL 恒带 buyer_id）
CREATE INDEX idx_review_buyer_pending ON review.review (buyer_id, created_at DESC) WHERE status = 'pending';
-- 我的评价
CREATE INDEX idx_review_buyer ON review.review (buyer_id, reviewed_at DESC) WHERE status <> 'pending';
-- 商品详情公开评价列表
CREATE INDEX idx_review_spu ON review.review (spu_id, reviewed_at DESC) WHERE status = 'published';
-- 卖家工作台（hidden 对卖家仍可见，只不可回复）
CREATE INDEX idx_review_shop ON review.review (shop_id, reviewed_at DESC) WHERE status IN ('published', 'hidden');
-- 平台治理全量列表
CREATE INDEX idx_review_created ON review.review (created_at DESC);

-- ── 审计动作：买家提交/追评不记审计（评价行本身即留痕），商家回复与平台处置要记 ──
INSERT INTO audit.audit_action (action, subject, description)
VALUES ('review.review.replied', 'review', '商家回复评价'),
       ('review.review.hidden', 'review', '平台隐藏违规评价'),
       ('review.review.restored', 'review', '平台恢复已隐藏评价')
ON CONFLICT (action) DO NOTHING;
