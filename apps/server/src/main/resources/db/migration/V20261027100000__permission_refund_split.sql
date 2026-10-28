SET lock_timeout = '3s';
SET statement_timeout = '60s';

-- ─────────────────────────────────────────────────────────────────────────────
-- 拆 ORDER_REFUND：处理售后（不动钱）与同意退款（动钱出口）分成两个码。
--
-- 一个码标 high 之后只有两个坏结局——要么「high 不授子账号」让客服连拒绝售后都做不了，
-- 要么放开授予让客服动钱。拆开之后两个诉求各得其所：
--
--   ORDER_REFUND          拒绝 / 留言 / 举证，不动钱，可授予子账号
--   ORDER_REFUND_APPROVE  同意退款 / 确认退款，动钱，主账号专属
--
-- 依据是动作的爆炸半径而不是岗位名称：拒绝不改变任何人的余额，「同意」改变。
-- ─────────────────────────────────────────────────────────────────────────────

-- ORDER_REFUND 降为 normal：动钱的部分搬去了 ORDER_REFUND_APPROVE
UPDATE common.permission
   SET risk_level = 'normal',
       description = '处理本店售后（拒绝 / 留言 / 举证），不动钱。同意退款是 ORDER_REFUND_APPROVE'
 WHERE code = 'ORDER_REFUND';

-- owner 修正：退款码的口径住 returns（approve / confirmRefund 都在那边），
-- 原来按码面相似挂在 trade 是 V20261025210000 回填时的顺手，不是决策
UPDATE common.permission SET owner = 'returns' WHERE code = 'ORDER_REFUND';

INSERT INTO common.permission (code, domain, owner, risk_level, description)
VALUES ('ORDER_REFUND_APPROVE', 'seller', 'returns', 'high', '同意退款 / 确认退款——动钱出口，主账号专属，不进子账号可授予清单')
ON CONFLICT (code) DO NOTHING;

-- 动钱点不进角色授权表：主账号的权限不走 role_permission（解析时按域全量给），
-- 这张表里出现 high 码就是违反授予策略——可能是手工改数，可能是将来授予接口漏了校验。
-- 迁移里清一次，Authorizer 启动扫描做长期防线。
DELETE FROM seller.role_permission
 WHERE permission_code IN ('ORDER_REFUND_APPROVE', 'SETTLEMENT_APPROVE');
