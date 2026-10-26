SET lock_timeout = '3s';
SET statement_timeout = '60s';

-- ─────────────────────────────────────────────────────────────────────────────
-- 收藏夹。**SPU 级，不是 SKU 级**——买家点的是商品页的心形图标，他没选颜色。
--
-- 住在 `cart` 里，不另开 schema：两者是同一件事的两个时态——购物车是「现在就想买」，
-- 收藏是「以后再买」。形状、失效处理、硬删口径、对外依赖（只有 catalog :: api）全都一样，
-- 拆成两个模块只换来两份要同步维护的边界注释。
-- 见 docs/domain/module-map.md §1「无域」与「暂存」两档的判据。
--
-- 形状比主分支那份多两处，都是踩过的坑：
--
-- 1. **不加 updated_at，但也不假装它是"只增只删"表。** 重复收藏是幂等的（不产生新行、
--    不改任何列），所以行确实永不 UPDATE。用 `ON CONFLICT DO NOTHING` 兑现，
--    而不是"先查再插"——后者并发下会双双查不到、双双插入。
--
-- 2. **没有软删列。** 取消收藏就是 DELETE。留 deleted_at 只会让每次查询多一个谓词，
--    而收藏这件事没有任何"历史"需要保留（它不涉及钱、不涉及履约）。
--    真要统计"曾经收藏过什么"，那是埋点，不该从业务表里挖。
--
-- 3. **created_at 就是唯一排序键，但要能当游标用。** 所以索引建在 (buyer_id, created_at DESC, id)——
--    只按 created_at 比会串同一毫秒的行（CursorCodec 的注释里写过同一条）。
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE cart.favorite_item
(
    id         uuid        PRIMARY KEY DEFAULT uuidv7(),
    buyer_id   uuid        NOT NULL,
    spu_id     uuid        NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE cart.favorite_item IS '买家收藏的商品（SPU 级）；重复收藏幂等，取消即硬删';
COMMENT ON COLUMN cart.favorite_item.spu_id IS 'catalog.spu.id，裸引用不加外键——跨 schema 不建外键是本库的既定口径';

-- 幂等开关的根基：同一买家同一商品只能有一行。
-- 加购是 ON CONFLICT 累加数量，收藏是 ON CONFLICT DO NOTHING——两者都不靠 catch 唯一键冲突，
-- 因为 PostgreSQL 撞唯一键会中止整个事务，catch 之后发不出任何语句。
CREATE UNIQUE INDEX uq_favorite_item_buyer_spu
    ON cart.favorite_item (buyer_id, spu_id);

-- 列表页：按收藏时间倒序，id 做平局裁决（游标键）。也是「我收藏过这个吗」点查的覆盖索引。
CREATE INDEX idx_favorite_item_buyer_created
    ON cart.favorite_item (buyer_id, created_at DESC, id DESC);

-- 批量查「这些商品我收藏了吗」：详情页心形状态、商品卡片上的小红心。
-- 主键 (buyer_id, spu_id) 已经在 uq_favorite_item_buyer_spu 里，IN 查询走它即可，
-- 不需要额外索引。
