SET lock_timeout = '3s';
SET statement_timeout = '60s';

-- 类目配置闭环第一刀：补齐配置层与事实层缺的列和约束。
--
-- 为什么不改原迁移：它们已合入主干，Flyway 校验和一变，已部署环境直接启动失败。
-- 这里全部是「只增」动作，唯一的删是 spu.images——图只能有一个真相源，见文件末尾。
--
-- 判据：这些列不是「以后可能有用」，是文档里已经写成规则、而库里没地方落的东西。
-- attribute.unit / attribute.status / category.sort 三列缺失，让「数字属性带单位」「属性只增不删、
-- 下线走 status」「同级类目有顺序」三条规则全成了空话。

-- ── category：顺序、时间、识别键值域 ────────────────────────────
ALTER TABLE catalog.category
    ADD COLUMN sort       integer     NOT NULL DEFAULT 0,
    ADD COLUMN created_at timestamptz NOT NULL DEFAULT now(),
    ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

COMMENT ON COLUMN catalog.category.sort IS '同级类目的展示顺序，升序';
COMMENT ON COLUMN catalog.category.identity_keys IS 'SPU 级识别键候选：model_no | article_no | param_hash | none';
COMMENT ON COLUMN catalog.category.sku_identity_kinds IS 'SKU 级识别键候选：gtin | param_hash | none。GTIN 只在这一列，不许进 identity_keys';
COMMENT ON COLUMN catalog.category.match_strategies IS '归并策略及优先级：model_no | article_no | param_hash';

ALTER TABLE catalog.category DROP CONSTRAINT ck_category_status;
ALTER TABLE catalog.category
    -- draft：配置没配齐，不能挂商品。原 CHECK 只有 active/frozen/closed，
    -- 「草稿类目 → 配属性模板 → 审核生效」这条流程在库里没有落脚点
    ADD CONSTRAINT ck_category_status CHECK (status IN ('draft', 'active', 'frozen', 'closed')),
    -- path 含自己、level 与路径段数一致：两条一起才能挡住「手工灌出来的歪树」
    ADD CONSTRAINT ck_category_path_shape CHECK (
        path LIKE '/%/'
        AND path LIKE '%/' || id::text || '/'
        AND level = array_length(string_to_array(btrim(path, '/'), '/'), 1)
    ),
    -- 识别键是枚举候选，不是自由文本。GTIN 进 SPU 级就是放错层级（product-model.md §2.1）
    ADD CONSTRAINT ck_category_identity_keys CHECK (
        array_length(identity_keys, 1) >= 1
        AND identity_keys <@ ARRAY['model_no', 'article_no', 'param_hash', 'none']::text[]
    ),
    ADD CONSTRAINT ck_category_sku_identity_kinds CHECK (
        array_length(sku_identity_kinds, 1) >= 1
        AND sku_identity_kinds <@ ARRAY['gtin', 'param_hash', 'none']::text[]
    ),
    ADD CONSTRAINT ck_category_match_strategies CHECK (
        match_strategies <@ ARRAY['model_no', 'article_no', 'param_hash']::text[]
    );

-- (parent_id, sort) 能服务「按父节点取子节点并按序」，单列 (parent_id) 是它的前缀，纯负债
CREATE INDEX idx_category_parent_sort ON catalog.category (parent_id, sort);
DROP INDEX catalog.idx_category_parent;

-- ── attribute：单位、启停、顺序、类型与身份的配对约束 ──────────
ALTER TABLE catalog.attribute
    ADD COLUMN unit       text,
    ADD COLUMN status     text        NOT NULL DEFAULT 'active',
    ADD COLUMN sort       integer     NOT NULL DEFAULT 0,
    ADD COLUMN created_at timestamptz NOT NULL DEFAULT now(),
    ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

COMMENT ON COLUMN catalog.attribute.unit IS '数字型属性的单位（m / cm / W）。没有它，1m 和 100cm 是两个值';
COMMENT ON COLUMN catalog.attribute.status IS 'disabled 后不再对新商品可见，存量属性值保留';

ALTER TABLE catalog.attribute
    ADD CONSTRAINT ck_attribute_status CHECK (status IN ('active', 'disabled')),
    -- 识别属性参与参数哈希。自由文本进哈希 = 同款归并直接失效（§2.2.5）
    ADD CONSTRAINT ck_attribute_identity_type CHECK (NOT is_identity OR value_type IN ('enum', 'number')),
    -- 枚举没有值域，等于自由文本
    ADD CONSTRAINT ck_attribute_enum_options CHECK (value_type <> 'enum' OR options IS NOT NULL),
    -- 单位只对数字有意义
    ADD CONSTRAINT ck_attribute_unit CHECK (unit IS NULL OR value_type = 'number');

CREATE INDEX idx_attribute_category_sort ON catalog.attribute (category_id, sort);
DROP INDEX catalog.idx_attribute_category;

-- ── brand：名字唯一、商家品牌要有归属 ─────────────────────────
ALTER TABLE catalog.brand
    ADD COLUMN owner_id   uuid,
    ADD COLUMN logo_url   text,
    ADD COLUMN created_at timestamptz NOT NULL DEFAULT now(),
    ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

COMMENT ON COLUMN catalog.brand.owner_id IS 'owner_type = merchant 时的归属商家；platform 为 null';

-- 两个「Apple」并存，商家在必填品牌类目里选错就挂到别的品牌上
CREATE UNIQUE INDEX uq_brand_name ON catalog.brand (lower(name));

ALTER TABLE catalog.brand
    ADD CONSTRAINT ck_brand_owner CHECK (owner_type = 'platform' OR owner_id IS NOT NULL);

-- ── spu：时间、match_key 与 identity_kind 必须同时成立 ────────
ALTER TABLE catalog.spu
    ADD COLUMN created_at timestamptz NOT NULL DEFAULT now(),
    ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

-- identity_kind 说了用哪种键认商品，match_key 就必须有；反之 none 不该带键
ALTER TABLE catalog.spu
    ADD CONSTRAINT ck_spu_match_key CHECK ((identity_kind = 'none') = (match_key IS NULL));

-- 图只能有一个真相源。spu.images 和 spu_media 并存时，规格图永远为空、
-- 通用图两处能对不上；spu_media 是文档 §2.3 设计的那张（图挂规格值，不挂 SKU）。
ALTER TABLE catalog.spu DROP COLUMN images;

-- ── spu_attr：三个值列必须恰好有一个 ─────────────────────────
-- 全 NULL 的行是「声明了这个属性但没有值」，它会让必填校验永远通过
ALTER TABLE catalog.spu_attr
    ADD CONSTRAINT ck_spu_attr_one_value CHECK (
        (value_text IS NOT NULL)::int
        + (value_num IS NOT NULL)::int
        + (value_bool IS NOT NULL)::int
        = 1
    );

-- 筛选面板按类型分别走索引；文本那条 idx_spu_attr_value 已经有了
CREATE INDEX idx_spu_attr_num ON catalog.spu_attr (attribute_id, value_num) WHERE value_num IS NOT NULL;
CREATE INDEX idx_spu_attr_bool ON catalog.spu_attr (attribute_id, value_bool) WHERE value_bool IS NOT NULL;

-- ── sku：时间 ────────────────────────────────────────────────
ALTER TABLE catalog.sku
    ADD COLUMN created_at timestamptz NOT NULL DEFAULT now(),
    ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

-- ── offer：时间 ──────────────────────────────────────────────
ALTER TABLE catalog.offer
    ADD COLUMN created_at timestamptz NOT NULL DEFAULT now(),
    ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

-- ── spu_media：通用图与规格图必须二选一 ──────────────────────
ALTER TABLE catalog.spu_media
    ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE catalog.spu_media
    ADD CONSTRAINT ck_spu_media_spec CHECK (
        (attribute_id IS NULL AND spec_value IS NULL)
        OR (attribute_id IS NOT NULL AND spec_value IS NOT NULL)
    );

-- ── updated_at 的唯一维护点 ──────────────────────────────────
-- 函数本体在前一个迁移（V20261022110500__common_touch_updated_at.sql）。
CREATE TRIGGER trg_category_touch BEFORE UPDATE ON catalog.category
    FOR EACH ROW EXECUTE FUNCTION common.touch_updated_at();
CREATE TRIGGER trg_attribute_touch BEFORE UPDATE ON catalog.attribute
    FOR EACH ROW EXECUTE FUNCTION common.touch_updated_at();
CREATE TRIGGER trg_brand_touch BEFORE UPDATE ON catalog.brand
    FOR EACH ROW EXECUTE FUNCTION common.touch_updated_at();
CREATE TRIGGER trg_spu_touch BEFORE UPDATE ON catalog.spu
    FOR EACH ROW EXECUTE FUNCTION common.touch_updated_at();
CREATE TRIGGER trg_sku_touch BEFORE UPDATE ON catalog.sku
    FOR EACH ROW EXECUTE FUNCTION common.touch_updated_at();
CREATE TRIGGER trg_offer_touch BEFORE UPDATE ON catalog.offer
    FOR EACH ROW EXECUTE FUNCTION common.touch_updated_at();
