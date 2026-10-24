SET lock_timeout = '3s';
SET statement_timeout = '60s';

-- 判权快照的版本号。CurrentOperator 是「每请求回库解析」的快照，version 是快照的身份：
-- 现在没有缓存、version 只是记录；将来热路径要加多级缓存时，按 (operatorId, version) 判失效，
-- 变更点 bump 一下旧快照全部过期——不用改判定语义，不用广播失效。
--
-- bump 纪律：凡是会影响 CurrentOperator 解析结果的写（status、role、角色-权限授权），
-- 同一条 UPDATE 里必须 bump。漏 bump 的后果不是现在出现，而是将来加缓存后权限变更延迟生效。
--
-- 三套身份域各一列，不共用表——同 access-control.md §1，不合成一张 user 表。

ALTER TABLE account.buyer ADD COLUMN permission_version bigint NOT NULL DEFAULT 0;
ALTER TABLE seller.operator ADD COLUMN permission_version bigint NOT NULL DEFAULT 0;
ALTER TABLE staff.account ADD COLUMN permission_version bigint NOT NULL DEFAULT 0;

COMMENT ON COLUMN account.buyer.permission_version IS '判权快照版本；影响身份解析的写（注销等）必须 bump';
COMMENT ON COLUMN seller.operator.permission_version IS '判权快照版本；角色/状态/店铺授权变更必须 bump';
COMMENT ON COLUMN staff.account.permission_version IS '判权快照版本；role/status 变更必须 bump';
