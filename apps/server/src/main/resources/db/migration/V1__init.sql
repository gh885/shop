-- V1: 初始化基础 Schema
-- 规则：脚本一旦合入不允许修改，变更一律新增下一个版本文件

CREATE SCHEMA IF NOT EXISTS kernel;

CREATE TABLE IF NOT EXISTS kernel.distributed_locks (
    lock_name VARCHAR(128) PRIMARY KEY,
    acquired_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    owner VARCHAR(64)
);
