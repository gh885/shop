SET lock_timeout = '3s';
SET statement_timeout = '60s';

-- 索引命名规约是 uq_<表>_<列>（database.md §5），uk_ 是笔误；趁未上线改名对齐。
-- 代码里没人按名字引用它（改默认地址的 ON CONFLICT 语义不靠索引名）。

ALTER INDEX account.uk_addresses_default RENAME TO uq_addresses_default;
