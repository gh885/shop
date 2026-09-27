-- V70: Review 模块 —— 订单评价（一单一评、逐商品行打分、追评一次、卖家回复一次）
-- 动机：成交链路此前缺「买家说一句」这一半——销量有了、转化链路没有评价，商详页与店铺都少了最硬的信任信号。
--
-- 设计取舍：
--   * 一单一评、append-only：评价不可改也不可删（唯一索引 uk_reviews_order_id 钉死一单一条），
--     修改评价等于让历史信任信号可以随买家心情重写。
--   * 逐商品行：好评率是「这个商品的口碑」，按订单整体给一个分会把它稀释成店铺分。
--   * 追评与回复挂在评价主体上（一对一的可空列）而不是独立表：各只有一次，用行表达反而多两次一致性问题。
--   * 商品名/图取下单快照（与 order.items 同一份快照口径），商品改名下架不影响历史评价。
--
-- 边界：评价是买家↔卖家之间的内容往来，不是平台治理动作，因此**不进 audit 账本**（REV-17）。

CREATE SCHEMA IF NOT EXISTS review;

CREATE TABLE IF NOT EXISTS review.reviews (
    id           UUID PRIMARY KEY DEFAULT uuidv7(),
    order_id     UUID NOT NULL,                  -- orders.orders.id，裸引用不加 FK；一单一条由唯一索引钉死
    user_id      UUID NOT NULL,                  -- account.users.id（评价人 = 订单归属买家）
    shop_id      UUID NOT NULL,                  -- shop.shops.id（订单本身即单店单）
    append_text  VARCHAR(200),                   -- 追评正文（一次，可空）
    appended_at  TIMESTAMPTZ,
    reply        VARCHAR(200),                   -- 卖家回复正文（一次，可空）
    reply_by     UUID,                           -- 回复的店铺成员 user id（留痕，不进买家可见内容）
    replied_at   TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 一单一评的并发闸门：并发表单只能有一条成功，另一条 409
CREATE UNIQUE INDEX IF NOT EXISTS uk_reviews_order_id ON review.reviews(order_id);

-- 店铺工作台按店列本店评价
CREATE INDEX IF NOT EXISTS idx_reviews_shop ON review.reviews(shop_id, created_at DESC);

CREATE TABLE IF NOT EXISTS review.review_items (
    id            UUID PRIMARY KEY DEFAULT uuidv7(),
    review_id     UUID NOT NULL,                 -- review.reviews.id（同 schema，应用层保证一致）
    order_item_id UUID NOT NULL,                 -- orders.items.id；同一订单行只能被评一次
    product_id    UUID NOT NULL,                 -- product.products.id，裸引用；商详按它聚合
    sku_id        UUID NOT NULL,                 -- product.skus.id
    name          VARCHAR(160) NOT NULL,         -- 商品名快照（与 orders.items.name 同宽）
    image         VARCHAR(255),                  -- 图片快照，与下单同源
    rating        SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    content       VARCHAR(200),                  -- 文字，可空（只打星也算一次评价）
    images        JSONB NOT NULL DEFAULT '[]',   -- 图片 key 数组（存 key 不存 URL，REV-07）
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 同一订单行只能被评一次
CREATE UNIQUE INDEX IF NOT EXISTS uk_review_items_order_item ON review.review_items(order_item_id);

-- 商详评价区主路径：按商品倒序翻页（配 REV-13 的稳定排序）
CREATE INDEX IF NOT EXISTS idx_review_items_product ON review.review_items(product_id, created_at DESC, id DESC);

-- 好评率聚合口径：同商品全部评分行（含未翻到的），分页切片不参与
CREATE INDEX IF NOT EXISTS idx_review_items_product_rating ON review.review_items(product_id, rating);
