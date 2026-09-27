-- V71: Coupon 二期 —— 折扣券（带封顶）+ 领取后 N 天相对有效期
-- 动机：满减券（满 X 减 Y）在客单价高的品类里几乎等于没有折扣——想给 15% 让利就得把门槛抬到「满 1000 减 150」，
--       而封顶与折率两列比「面额」更能表达真实意图（「9 折，最多减 50」）。相对有效期则是另一件常事：
--       「领了 7 天内有效」比给一个所有人都一样的绝对窗口更符合活动语义。
--
-- 设计取舍：
--   * 判别列 + 互斥 CHECK：type 两值；DISCOUNT 必带折率与封顶、FULL_REDUCTION 两列必空。
--     不用「discount_amount 为 0 表示折扣券」那种空缺约定——那会让「面额为 0 的满减券」与折扣券不可区分。
--   * 折率存 0.01~0.99 的比例（0.90 = 9 折），不存「几折」的整数：整数档把 9.5 折逼成四舍五入，且前端输入框
--     天然是「折扣率」这个形状。
--   * 封顶必填（CPN-65）：没封顶的折扣券在大单上会亏穿，创建时挡住比事后停券重建便宜。
--   * valid_days 只在领取时刻换算成绝对窗口落进 user_coupons（CPN-68/69），读券路径不碰模板。
--     模板的 valid_from/valid_to 仍是发放窗口（什么时候能领），两者不同轴。
--
-- 列的松紧变化：discount_amount 原来 NOT NULL CHECK(>0)（V56，满减券唯一形态下它恒有意义），
-- 折扣券的面额由 discount_rate + max_discount_amount 表达，这一列对它没有值，因此去掉 NOT NULL，
-- 并把「满减券必 >0、折扣券必为空」的互斥补进新 CHECK —— 旧 CHECK (>0) 保留（null 不违反 CHECK）。

ALTER TABLE coupon.coupon_templates
    ALTER COLUMN discount_amount DROP NOT NULL;

ALTER TABLE coupon.coupon_templates
    ADD COLUMN IF NOT EXISTS type VARCHAR(16) NOT NULL DEFAULT 'FULL_REDUCTION',
    ADD COLUMN IF NOT EXISTS discount_rate NUMERIC(4, 2),
    ADD COLUMN IF NOT EXISTS max_discount_amount BIGINT,
    ADD COLUMN IF NOT EXISTS valid_days INTEGER;

-- 存量行全是满减券：补上 type（DEFAULT 已填）后把两型互斥的 CHECK 加上，历史行自然满足
ALTER TABLE coupon.coupon_templates
    DROP CONSTRAINT IF EXISTS ck_coupon_templates_discount_shape;

ALTER TABLE coupon.coupon_templates
    ADD CONSTRAINT ck_coupon_templates_type
        CHECK (type IN ('FULL_REDUCTION', 'DISCOUNT'));

ALTER TABLE coupon.coupon_templates
    ADD CONSTRAINT ck_coupon_templates_discount_shape
        CHECK (
            (type = 'DISCOUNT'
                AND discount_rate IS NOT NULL AND discount_rate > 0 AND discount_rate < 1
                AND max_discount_amount IS NOT NULL AND max_discount_amount > 0
                AND discount_amount IS NULL)
            OR (type = 'FULL_REDUCTION'
                AND discount_rate IS NULL AND max_discount_amount IS NULL)
        );

-- 相对有效期：1~365 天，与入口 CouponFieldRules 的档位同值
ALTER TABLE coupon.coupon_templates
    DROP CONSTRAINT IF EXISTS ck_coupon_templates_valid_days;

ALTER TABLE coupon.coupon_templates
    ADD CONSTRAINT ck_coupon_templates_valid_days CHECK (valid_days IS NULL OR valid_days BETWEEN 1 AND 365);

-- 用户券：同名的三列快照（折率/封顶/券型）；发放窗口的换算结果仍落在 effective_at / expire_at
ALTER TABLE coupon.user_coupons
    ALTER COLUMN discount_amount DROP NOT NULL;

ALTER TABLE coupon.user_coupons
    ADD COLUMN IF NOT EXISTS type VARCHAR(16) NOT NULL DEFAULT 'FULL_REDUCTION',
    ADD COLUMN IF NOT EXISTS discount_rate NUMERIC(4, 2),
    ADD COLUMN IF NOT EXISTS max_discount_amount BIGINT;

ALTER TABLE coupon.user_coupons
    DROP CONSTRAINT IF EXISTS ck_user_coupons_discount_shape;

ALTER TABLE coupon.user_coupons
    ADD CONSTRAINT ck_user_coupons_type CHECK (type IN ('FULL_REDUCTION', 'DISCOUNT'));

ALTER TABLE coupon.user_coupons
    ADD CONSTRAINT ck_user_coupons_discount_shape
        CHECK (
            (type = 'DISCOUNT'
                AND discount_rate IS NOT NULL AND discount_rate > 0 AND discount_rate < 1
                AND max_discount_amount IS NOT NULL AND max_discount_amount > 0
                AND discount_amount IS NULL)
            OR (type = 'FULL_REDUCTION'
                AND discount_rate IS NULL AND max_discount_amount IS NULL)
        );
