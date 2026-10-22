SET lock_timeout = '3s';
SET statement_timeout = '60s';

-- 类目深度定死三层，删掉 is_leaf。
--
-- 两件事其实是一件事：前端早就按三层做了（admin 的 CATEGORY_MAX_LEVEL = 3、
-- isLeafCategory 判 level === 3、文案写「前两级只是分组，商品只能挂在三级类目上」），
-- 只有后端和文档还写着四层。留着 4 层不是"多一层没关系"，是"前端永远选不出第 4 层，
-- 而库里能存出来"——那种数据没人能通过正常路径创建，也没人会在测试里覆盖到。
--
-- 删 is_leaf 的理由更硬：三层定死之后，"是不是叶子"不用存，level = 3 就能算出来。
-- 存下来就得维护它，而代码里根本没维护——插子类目时不把父类目改成 false。
-- 于是它能和 level 对不上，而 createDraft 恰恰靠它拦「往非叶子挂商品」。
-- 一个能自己算出来的字段被存成第二个真相源，就一定会漂移。

-- 存量数据先对齐：原来的 ck_category_level 允许 1..4，若已有 level=4 的行会卡住下面的加约束。
-- 这里不静默删数据——有 level=4 就直接失败，让人来看。空表时它什么也不做。
DO $$
DECLARE
    deep integer;
BEGIN
    SELECT count(*) INTO deep FROM catalog.category WHERE level > 3;
    IF deep > 0 THEN
        RAISE EXCEPTION '存在 % 个 level > 3 的类目，需要先人工决定迁到哪一层，本迁移不静默删数据', deep;
    END IF;
END;
$$;

ALTER TABLE catalog.category DROP CONSTRAINT ck_category_level;
ALTER TABLE catalog.category DROP COLUMN is_leaf;

ALTER TABLE catalog.category
    ADD CONSTRAINT ck_category_level CHECK (level BETWEEN 1 AND 3);

COMMENT ON COLUMN catalog.category.level IS '层级 1..3。3 是叶子，只有叶子能挂商品；is_leaf 不再存，由 level 推导';
