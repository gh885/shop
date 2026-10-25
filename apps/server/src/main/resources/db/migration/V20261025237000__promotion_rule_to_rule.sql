SET lock_timeout = '3s';
SET statement_timeout = '60s';

-- ─────────────────────────────────────────────────────────────────────────────
-- promotion.promotion_rule → promotion.rule：schema 已经说了是 promotion，
-- 表名再重复一遍是结巴。引用列 rule_id 本就正确，不受影响。
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE promotion.promotion_rule RENAME TO rule;

ALTER INDEX promotion.idx_promotion_rule_active RENAME TO idx_rule_active;
ALTER INDEX promotion.idx_promotion_rule_list RENAME TO idx_rule_list;

ALTER TABLE promotion.rule RENAME CONSTRAINT ck_promotion_scope TO ck_rule_scope;
ALTER TABLE promotion.rule RENAME CONSTRAINT ck_promotion_bearer TO ck_rule_bearer;
ALTER TABLE promotion.rule RENAME CONSTRAINT ck_promotion_base_mode TO ck_rule_base_mode;
ALTER TABLE promotion.rule RENAME CONSTRAINT ck_promotion_status TO ck_rule_status;
ALTER TABLE promotion.rule RENAME CONSTRAINT ck_promotion_benefit TO ck_rule_benefit;
ALTER TABLE promotion.rule RENAME CONSTRAINT ck_promotion_rate TO ck_rule_rate;
ALTER TABLE promotion.rule RENAME CONSTRAINT ck_promotion_fixed TO ck_rule_fixed;
ALTER TABLE promotion.rule RENAME CONSTRAINT ck_promotion_threshold TO ck_rule_threshold;
ALTER TABLE promotion.rule RENAME CONSTRAINT ck_promotion_window TO ck_rule_window;
