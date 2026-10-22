SET lock_timeout = '3s';
SET statement_timeout = '60s';

-- 删 spu.status：又一个 is_leaf。
--
-- 它只在发布通过时被写成 'active'（CatalogPublishService 两处），全项目没有任何地方读它，
-- 下架时也不会改回去。而真正的售卖状态在 offer.status——文档自己也这么说：
-- 「spu.status 只是摘要，真正的售卖状态在 offer。两者不一致时以 offer 为准」。
--
-- 一个能从 offer 推导出来的状态，只在一半路径上维护，就一定会漂：
-- 商品下架后 spu.status 还是 'active'，而这个字段既没人读、也没人修。
-- 这和 is_leaf 是同一个病：把可推导的东西存成第二个真相源。
--
-- 删掉之后，"这个商品现在能不能卖"只有一个答案：有没有 online 的 offer。
-- 买家详情（ProductStore.FIND_DETAIL）本来就是这么判的（EXISTS ... status = 'online'）。

ALTER TABLE catalog.spu DROP COLUMN status;

-- 原来的两个索引带 status，删列时索引自动失效，重建纯 category 那条
DROP INDEX IF EXISTS catalog.idx_spu_merchant;
DROP INDEX IF EXISTS catalog.idx_spu_category;

CREATE INDEX idx_spu_merchant ON catalog.spu (merchant_id);
CREATE INDEX idx_spu_category ON catalog.spu (category_id);

COMMENT ON COLUMN catalog.spu.spu_type IS 'merchant | standard。可售状态不在这里，看 catalog.offer.status';
