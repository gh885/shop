SET lock_timeout = '3s';
SET statement_timeout = '60s';

-- 通用 updated_at 维护函数。放 common，因为它是基础设施而不是某个模块的业务。
--
-- 为什么必须有触发器：updated_at 靠每个 UPDATE 记得带一句，漏一次就永远是旧值。
-- 而增量同步（search 重建索引）和缓存失效都以它为判据，错了是静默的——
-- 不会报错，只会让某个商品永远不出现在搜索结果里。
CREATE OR REPLACE FUNCTION common.touch_updated_at() RETURNS trigger AS
$$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION common.touch_updated_at() IS '通用 updated_at 维护触发器：任何 UPDATE 都把 updated_at 推到 now()';
