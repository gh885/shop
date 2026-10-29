SET lock_timeout = '3s';
SET statement_timeout = '60s';

-- 条件可见：某个属性只在另一个属性取到指定值时出现。
--
-- 只存规则，不在库里求值。规则形状：
--   {"attributeId": "<uuid>", "operator": "eq|neq|in", "values": ["定制"]}
-- NULL = 始终可见。
--
-- 依赖只允许单层：被依赖属性自己不能再带 visible_when。多层依赖要拓扑排序，
-- 还得处理环；运营配置的场景用不上，复杂度却会翻几倍。
ALTER TABLE catalog.attribute
    ADD COLUMN visible_when jsonb;

ALTER TABLE catalog.attribute
    ADD CONSTRAINT ck_attribute_visible_when
        CHECK (
            visible_when IS NULL
                OR (
                jsonb_typeof(visible_when) = 'object'
                    AND visible_when ? 'attributeId'
                    AND visible_when ? 'operator'
                    AND visible_when ? 'values'
                )
            );

COMMENT ON COLUMN catalog.attribute.visible_when IS
    '条件可见规则；NULL = 始终可见。被依赖属性不得再依赖，避免成环';
