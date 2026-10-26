SET lock_timeout = '3s';
SET statement_timeout = '60s';

-- ─────────────────────────────────────────────────────────────────────────────
-- 修 trust → governance 改名漏掉的函数体。
--
-- `V20261025235000__trust_to_governance.sql` 只做了 `ALTER SCHEMA trust RENAME TO governance`
-- 和权限码改名。`ALTER SCHEMA RENAME` 会跟着改函数**所在**的 schema，但**不会改函数体里
-- 写死的 schema 限定名**——`PERFORM trust.assert_leaf_category(...)` 里的 `trust` 是文本。
--
-- 后果：给商家授类目 / 授品牌 / 录资质三条链路全部失败
-- （`ERROR: schema "trust" does not exist`），而这正是商家能开始卖货的前提。
-- 也就是说**新商家在改名之后完全无法入驻**。
--
-- 为什么没被发现：现有测试造治理数据都是直接 `INSERT INTO governance.category_grant`，
-- 而 PostgreSQL 的 `ALTER TABLE ... DISABLE TRIGGER` 从没被用过——触发器一直是开着的，
-- 只是没有任何测试走过这条插入。这次的 `SellerProductEditTest` 是第一个。
--
-- 用 `CREATE OR REPLACE` 重写三个函数，把 `trust.` 换成 `governance.`。
-- 函数的签名、返回类型、触发时机都不变，所以不需要重建触发器。
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION governance.trg_category_grant_leaf() RETURNS trigger AS $$
BEGIN
    PERFORM governance.assert_leaf_category(NEW.category_id, '类目授权');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION governance.trg_brand_grant_leaf() RETURNS trigger AS $$
BEGIN
    PERFORM governance.assert_leaf_category(NEW.category_id, '品牌授权');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION governance.trg_credential_leaf() RETURNS trigger AS $$
BEGIN
    IF NEW.category_id IS NOT NULL THEN
        PERFORM governance.assert_leaf_category(NEW.category_id, '资质');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
