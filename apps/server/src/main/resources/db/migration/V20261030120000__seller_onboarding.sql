SET lock_timeout = '3s';
SET statement_timeout = '60s';

-- ─────────────────────────────────────────────────────────────────────────────
-- 入驻：身份即时成立，资格由治理审核
--
-- 分工：注册（merchant + 主账号 operator + 默认 shop）与入驻申请单归 seller——那是「你是谁」
-- 和「你申请了什么」；资格判定归 governance.seller_profile（applied → active/rejected），
-- canSell 只认它。审核通过/驳回由 governance 在其事务里经 OnboardingCommand 回写本表
-- （api 命令，不走事件——卖家端的重提闸门不允许有「已通过却重提报错」的窗口）。
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE seller.onboarding
(
    merchant_id   uuid PRIMARY KEY,
    status        text        NOT NULL DEFAULT 'pending',
    reject_reason text,
    decided_at    timestamptz,
    updated_at    timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT ck_onboarding_status CHECK (status IN ('pending', 'approved', 'rejected'))
);

COMMENT ON TABLE seller.onboarding IS '入驻审核结论的卖家侧投影；源头是 governance.seller_profile.status';

INSERT INTO audit.audit_action (action, subject, description) VALUES
    ('seller.merchant.registered', 'seller', '商家注册：身份与默认店铺即时成立，入驻待审'),
    ('seller.merchant.resubmitted', 'seller', '入驻被拒后重新提交审核'),
    ('seller.shop.renamed', 'seller', '店铺改名'),
    ('seller.shop.closed', 'seller', '店铺关闭（终态，联动下架在线商品）'),
    ('governance.seller.approved', 'governance', '入驻审核通过，商家获得售卖资格'),
    ('governance.seller.rejected', 'governance', '入驻审核驳回')
ON CONFLICT (action) DO NOTHING;
