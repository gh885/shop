-- V22: kernel.event_publication 事件发布登记表（Spring Modulith Event Publication Registry）
-- 归属：跨模块基建，与 distributed_locks 同居 kernel schema
-- 用途：AFTER_COMMIT 类监听器的事务性 outbox——发布与业务同事务落一行登记，提交后消费；
--       进程崩溃/消费抛错留下未完成登记，由重启补发（republish-outstanding-events-on-restart）
--       与 infra/events/EventPublicationRecoveryJob 定期重投，保证 at-least-once
-- DDL：对齐 spring-modulith-events-jdbc 2.1.0 内置 v2 结构（schema-postgresql.sql）加 kernel 前缀；
--       列结构升级由框架版本驱动，勿手改列名

CREATE SCHEMA IF NOT EXISTS kernel;

CREATE TABLE IF NOT EXISTS kernel.event_publication (
    id                     UUID PRIMARY KEY,
    listener_id            TEXT NOT NULL,
    event_type             TEXT NOT NULL,
    serialized_event       TEXT NOT NULL,
    publication_date       TIMESTAMPTZ NOT NULL,
    completion_date        TIMESTAMPTZ,
    status                 TEXT,
    completion_attempts    INT,
    last_resubmission_date TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS event_publication_serialized_event_hash_idx ON kernel.event_publication USING hash(serialized_event);
CREATE INDEX IF NOT EXISTS event_publication_by_completion_date_idx ON kernel.event_publication (completion_date);
