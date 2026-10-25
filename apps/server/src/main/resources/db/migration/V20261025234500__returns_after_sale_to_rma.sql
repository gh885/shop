SET lock_timeout = '3s';
SET statement_timeout = '60s';

-- ─────────────────────────────────────────────────────────────────────────────
-- returns.after_sale_case → rma_case。
-- RMA（Return Merchandise Authorization）是售后授权单的行业词。
-- 语义张力要写明：本表的 type 含 refund_only（仅退款，无实物返还），RMA 字面
-- 盖不住它——这里取 RMA 的「售后授权」泛义，仅退款型同样是一笔需要授权的售后。
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE returns.after_sale_case RENAME TO rma_case;

COMMENT ON TABLE returns.rma_case IS
    '售后单（RMA）；一套状态机，type 只决定中间有没有货物往返。'
    'refund_only 型并无实物返还，RMA 取其「售后授权」泛义';
