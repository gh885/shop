SET lock_timeout = '3s';
SET statement_timeout = '60s';

-- ─────────────────────────────────────────────────────────────────────────────
-- 运营入口：运费模板与促销规则的写入侧。
--
-- 两张表此前只能靠 SQL 造——系统有算价、有活动，却没有"谁去配"的入口。
-- 这一版补三样东西：模板的草稿态、两条权限点、两个动作的审计登记。
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. 运费模板加草稿态 ─────────────────────────────────────────────────────
--
-- 加 draft 不是为了"暂存"，是为了**启用前能改**。原来的两态里，新建出来就得是 active，
-- 而 active 一旦被报价单引用，再改就等于改历史——只能建一条新的顶掉旧的。
-- 有了 draft：先攒好，确认无误再启用；启用时把旧的归档，同一事务里做完。
--
-- uq_shipping_template_active 是部分唯一索引（where status='active'），
-- 加一个状态值不会让它放宽：一个店仍然只能有一条 active。

ALTER TABLE seller.shipping_template DROP CONSTRAINT ck_shipping_status;
ALTER TABLE seller.shipping_template
    ADD CONSTRAINT ck_shipping_status CHECK (status IN ('draft', 'active', 'archived'));

ALTER TABLE seller.shipping_template
    ADD COLUMN created_at timestamptz NOT NULL DEFAULT now(),
    ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

CREATE TRIGGER trg_shipping_template_touch BEFORE UPDATE ON seller.shipping_template
    FOR EACH ROW EXECUTE FUNCTION common.touch_updated_at();

-- 商家后台按"我这家店有几套模板、哪套在用"翻页，只取 active 走 uq 索引，全量列表走这个。
CREATE INDEX idx_shipping_template_shop ON seller.shipping_template (shop_id, status, id DESC);

COMMENT ON COLUMN seller.shipping_template.status IS
    'draft 可改可删；active 是算价唯一认的状态，改它等于改历史报价的证据；archived 只读';

-- ── 2. 促销规则同样加时间戳 ─────────────────────────────────────────────────
--
-- version 是"这条规则改过几次"的标记，改了金额参数必须 +1；updated_at 是"什么时候改的"。
-- 两个都要：报价单里存的是 v3，运营要能查到 v3 是几点上线的。

ALTER TABLE promotion.promotion_rule
    ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

CREATE TRIGGER trg_promotion_rule_touch BEFORE UPDATE ON promotion.promotion_rule
    FOR EACH ROW EXECUTE FUNCTION common.touch_updated_at();

CREATE INDEX idx_promotion_rule_list ON promotion.promotion_rule (status, priority, id DESC);

-- ── 3. 两条权限点 ───────────────────────────────────────────────────────────
--
-- shipping:manage 归卖家域，沿用库里既有的 `域:动作` 小写写法（order:read / product:write）。
-- PROMOTION_MANAGE 归平台域，沿用大写写法（CATEGORY_MANAGE / COUPON_OPS）——
-- 两套写法并存是历史，不是新设计，跟着邻近的走比统一改名风险小。
--
-- 为什么不复用 COUPON_OPS：券是"发一张给某个人"，满减是"改所有人看到的价格"，
-- 两件事的爆炸半径差一个数量级，能发券不等于能改价。

INSERT INTO common.permission (code, description) VALUES
    ('shipping:manage',  '运费模板（建、改、启用、归档）'),
    ('PROMOTION_MANAGE', '平台促销规则（满减、折扣的配置与上下线）')
ON CONFLICT (code) DO NOTHING;

-- 卖家侧不写 role_permission：seller.role 现在一行种子都没有，写了也是空操作。
-- 主账号（is_primary）本来就持有 common.permission 全表，shipping:manage 立刻生效；
-- 等子账号角色开始种的时候，在那一份种子里带上这个码即可。
INSERT INTO staff.role_permission (role, permission_code)
SELECT 'OPS', 'PROMOTION_MANAGE'
ON CONFLICT DO NOTHING;

INSERT INTO staff.role_permission (role, permission_code)
SELECT 'SUPER_ADMIN', 'PROMOTION_MANAGE'
ON CONFLICT DO NOTHING;

-- ── 4. 审计动作 ─────────────────────────────────────────────────────────────
--
-- 只登记四个：两个实体 × （改内容 / 改状态）。
-- 运费模板是商家自己的配置，但改它等于改买家付多少运费；促销规则更是直接改价。
-- 这类改动事后一定要能回答"谁在什么时候把门槛从 200 改成 300"。

INSERT INTO audit.audit_action (action, subject, description) VALUES
    ('seller.shipping_template.saved',        'seller',    '运费模板内容变更（新建 / 编辑）'),
    ('seller.shipping_template.status_changed', 'seller',  '运费模板启用或归档'),
    ('promotion.rule.saved',                  'promotion', '促销规则内容变更（新建 / 编辑）'),
    ('promotion.rule.status_changed',         'promotion', '促销规则启用或归档')
ON CONFLICT (action) DO NOTHING;
