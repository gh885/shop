SET lock_timeout = '3s';
SET statement_timeout = '60s';

-- 配置从 category 挪到 category_config：只有叶子类目能有配置。
--
-- 问题不是"字段放错表"，是"配置属于谁"这个概念错了。identity_keys / sku_identity_kinds /
-- match_strategies / brand_policy / qualification_codes / auto_approve 六列只对 L3 叶子有意义，
-- 却平铺在每一行上：L1、L2 那六列永远是 NULL、永远不被读。
--
-- 之前试过的补丁是"五列改可空 + 沿链解析"，但那只是给错误模型打补丁：
--   · 表里仍然有六个对 L1/L2 永远为空的列
--   · 仍然要写三个合并函数去沿链算
--   · 仍然要靠纪律约束业务代码别读单行
--   · 运营在 L1 填了 identity_keys 没有任何机制阻止，只是解析时恰好被 L3 覆盖
--
-- 补丁式继承的代价是错误模型永远留在表里，每次读都要绕过它。
--
-- 改成：category 只描述"在哪"（树结构），category_config 只描述"要求什么"（只挂叶子）。
-- 于是读一个叶子的配置就是一条 WHERE category_id = ?，不需要解析器。
-- "L1 配了会怎样"这个问题消失了——它存不进去。

CREATE TABLE catalog.category_config
(
    category_id         uuid PRIMARY KEY,
    identity_keys       text[]      NOT NULL,
    sku_identity_kinds  text[]      NOT NULL,
    match_strategies    text[]      NOT NULL DEFAULT '{}',
    brand_policy        text        NOT NULL DEFAULT 'optional',
    qualification_codes text[]      NOT NULL DEFAULT '{}',
    auto_approve        boolean     NOT NULL DEFAULT false,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT ck_config_identity_keys CHECK (
        array_length(identity_keys, 1) >= 1
        AND identity_keys <@ ARRAY['model_no', 'article_no', 'param_hash', 'none']::text[]
    ),
    CONSTRAINT ck_config_sku_identity_kinds CHECK (
        array_length(sku_identity_kinds, 1) >= 1
        AND sku_identity_kinds <@ ARRAY['gtin', 'param_hash', 'none']::text[]
    ),
    CONSTRAINT ck_config_match_strategies CHECK (
        match_strategies <@ ARRAY['model_no', 'article_no', 'param_hash']::text[]
    ),
    CONSTRAINT ck_config_brand_policy CHECK (brand_policy IN ('required', 'optional', 'forbidden'))
);

COMMENT ON TABLE catalog.category_config IS
    '类目配置：只对叶子类目（level = 3）存在。一行一个类目，不做继承——没有继承就没有"子类目放宽父类目"这个风险';

-- 只有叶子能有配置。这是结构约束，不是纪律：非叶子插配置行直接被库拒。
--
-- 用触发器而不是 CHECK：CHECK 不能跨表读 level，而这里要读 catalog.category。
-- 触发器是唯一对属主也生效的护栏（同 common.reject_mutation 的理由）。
CREATE OR REPLACE FUNCTION catalog.require_leaf_config() RETURNS trigger AS
$$
DECLARE
    category_level smallint;
BEGIN
    SELECT level INTO category_level FROM catalog.category WHERE id = NEW.category_id;
    IF category_level IS NULL THEN
        RAISE EXCEPTION '类目不存在: %', NEW.category_id;
    END IF;
    IF category_level <> 3 THEN
        RAISE EXCEPTION '只有叶子类目（level = 3）能有配置，类目 % 是第 % 层', NEW.category_id, category_level;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION catalog.require_leaf_config() IS 'category_config 的护栏：只有 level = 3 的类目能插配置';

CREATE TRIGGER trg_category_config_leaf
    BEFORE INSERT OR UPDATE ON catalog.category_config
    FOR EACH ROW EXECUTE FUNCTION catalog.require_leaf_config();

CREATE TRIGGER trg_category_config_touch BEFORE UPDATE ON catalog.category_config
    FOR EACH ROW EXECUTE FUNCTION common.touch_updated_at();

-- 属性模板同理：只挂叶子。非叶子的属性模板有歧义——识别键定不下来。
CREATE OR REPLACE FUNCTION catalog.require_leaf_attribute() RETURNS trigger AS
$$
DECLARE
    category_level smallint;
BEGIN
    SELECT level INTO category_level FROM catalog.category WHERE id = NEW.category_id;
    IF category_level IS NULL THEN
        RAISE EXCEPTION '类目不存在: %', NEW.category_id;
    END IF;
    IF category_level <> 3 THEN
        RAISE EXCEPTION '只有叶子类目（level = 3）能有属性模板，类目 % 是第 % 层', NEW.category_id, category_level;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_attribute_leaf
    BEFORE INSERT OR UPDATE ON catalog.attribute
    FOR EACH ROW EXECUTE FUNCTION catalog.require_leaf_attribute();

-- category 上那六列删掉。存量数据先搬到 category_config（只搬 level = 3 的行）。
INSERT INTO catalog.category_config
    (category_id, identity_keys, sku_identity_kinds, match_strategies,
     brand_policy, qualification_codes, auto_approve)
SELECT id,
       COALESCE(identity_keys, '{none}'),
       COALESCE(sku_identity_kinds, '{none}'),
       COALESCE(match_strategies, '{}'),
       COALESCE(brand_policy, 'optional'),
       COALESCE(qualification_codes, '{}'),
       COALESCE(auto_approve, false)
  FROM catalog.category
 WHERE level = 3;

ALTER TABLE catalog.category
    DROP COLUMN identity_keys,
    DROP COLUMN sku_identity_kinds,
    DROP COLUMN match_strategies,
    DROP COLUMN brand_policy,
    DROP COLUMN qualification_codes,
    DROP COLUMN auto_approve;

-- 上一个迁移给 category 加的三个 CHECK 引用了刚删的列，约束随列一起没了，这里只清理残留名字。
-- （PostgreSQL 删列时依赖它的 CHECK 自动删除，不需要显式 DROP。）
