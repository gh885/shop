SET lock_timeout = '3s';
SET statement_timeout = '60s';

-- 授权只能挂在叶子上，和 category_config / attribute 同一条规矩。
--
-- 问题：trust.category_grant 存的是类目 id，而发布时传的是 L3 叶子。原来 TrustStore 用
-- `g.category_id = :categoryId` 精确匹配，于是「给商家授予 L1 数码配件」等于没授权——
-- 精确匹配对不上任何叶子类目，canSell 一直返回 CATEGORY_NOT_GRANTED，而且没有任何提示。
--
-- 这比 catalog 那边「字段存了没人读」更难发现：字段没读只是少一道校验，
-- 授权被静默作废是「看起来授权了、其实没授权」。
--
-- 修法选「强制只挂叶子」而不是「沿 path 向上查找祖先」，理由：
--   · 授权是商业条款，运营心里想的就是「这个类目能不能卖」，不是「这个分组能不能卖」
--   · 沿链查找会让 canSell 每次多读一层，且「L1 授权自动覆盖所有 L3 子孙」是个隐含语义，
--     出事时说不清是授了 L1 还是授了某个具体 L3
--   · 和 category_config 用同一条规矩，只有一种解释
--
-- brand_grant 同理：它本来就带 category_id，是「这个品牌在这个类目能卖」。
-- credential 的 category_id 可空（null = 全平台通用资质），非空时同样只能挂叶子。

-- ── 判定函数（非触发器）：给叶子用 true，非叶子抛错 ───────────
CREATE OR REPLACE FUNCTION trust.assert_leaf_category(target uuid, what text) RETURNS void AS
$$
DECLARE
    category_level smallint;
    category_code  text;
BEGIN
    SELECT level, code INTO category_level, category_code
      FROM catalog.category WHERE id = target;

    IF category_level IS NULL THEN
        RAISE EXCEPTION '类目不存在: %', target;
    END IF;
    IF category_level <> 3 THEN
        RAISE EXCEPTION '% 只能挂在叶子类目（level = 3）上，% 是第 % 层', what, category_code, category_level;
    END IF;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION trust.assert_leaf_category(uuid, text) IS
    '授权/资质只能挂叶子类目，否则会被静默作废（精确匹配对不上任何 L3）';

-- ── category_grant ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION trust.trg_category_grant_leaf() RETURNS trigger AS
$$
BEGIN
    PERFORM trust.assert_leaf_category(NEW.category_id, '类目授权');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_category_grant_leaf
    BEFORE INSERT OR UPDATE ON trust.category_grant
    FOR EACH ROW EXECUTE FUNCTION trust.trg_category_grant_leaf();

-- source 之前能存任何字符串
ALTER TABLE trust.category_grant
    ADD CONSTRAINT ck_category_grant_source CHECK (source IN ('platform', 'application', 'migration'));

-- ── brand_grant ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION trust.trg_brand_grant_leaf() RETURNS trigger AS
$$
BEGIN
    PERFORM trust.assert_leaf_category(NEW.category_id, '品牌授权');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_brand_grant_leaf
    BEFORE INSERT OR UPDATE ON trust.brand_grant
    FOR EACH ROW EXECUTE FUNCTION trust.trg_brand_grant_leaf();

-- ── credential：category_id 可空，非空时才校验 ──────────────
CREATE OR REPLACE FUNCTION trust.trg_credential_leaf() RETURNS trigger AS
$$
BEGIN
    IF NEW.category_id IS NOT NULL THEN
        PERFORM trust.assert_leaf_category(NEW.category_id, '资质');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_credential_leaf
    BEFORE INSERT OR UPDATE ON trust.credential
    FOR EACH ROW EXECUTE FUNCTION trust.trg_credential_leaf();

-- ── 枚举列的 CHECK：之前能存进任何字符串 ─────────────────────
-- seller_profile.level：商家分层，四档
ALTER TABLE trust.seller_profile
    ADD CONSTRAINT ck_profile_level CHECK (level IN ('L1', 'L2', 'L3', 'L4'));

-- credential.type：资质类型。取值必须能和 catalog.category_config.qualification_codes 对上——
-- 那边存的是类目要求的资质代码，这边存的是商家实际持有的资质。
-- 两边的值域对不上时，「类目要 3C」永远匹配不到商家的 3C 证书。
ALTER TABLE trust.credential
    ADD CONSTRAINT ck_credential_type CHECK (
        type IN ('3C', 'FOOD_LICENSE', 'DRUG_LICENSE', 'COSMETIC_FILING', 'BRAND_AUTH', 'QUALITY_REPORT', 'OTHER')
    );
