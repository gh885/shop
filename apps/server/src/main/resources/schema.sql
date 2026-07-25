-- 初始化数据库 Schema
-- 开发阶段自动执行，后续生产环境切换为 Flyway

CREATE SCHEMA IF NOT EXISTS kernel;

CREATE TABLE IF NOT EXISTS kernel.distributed_locks (
    lock_name VARCHAR(128) PRIMARY KEY,
    acquired_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    owner VARCHAR(64)
);
