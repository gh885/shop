SET lock_timeout = '3s';
SET statement_timeout = '60s';

-- 消费端去重表。事件投递是 at-least-once，同一条事件可能来两遍，靠这张表挡掉第二次。
--
-- 主键 (consumer, event_id)：
--   consumer —— 消费方标识，用「模块名 + 监听器方法名」这类稳定字符串
--   event_id —— 生产端生成的 UUIDv7，不是消费端自己造的
--
-- 为什么不用「先查再插」：两个消费者同时查都会得到"没消费过"，然后都处理，去重白做。
-- 为什么不用 try/catch 唯一键冲突：PostgreSQL 里一条语句报错后整个事务就废了，catch 住也没法继续。
-- 正确写法是 INSERT ... ON CONFLICT DO NOTHING，看影响行数（见 EventInbox）。
CREATE TABLE common.consumed_event
(
    consumer    text        NOT NULL,
    event_id    uuid        NOT NULL,
    consumed_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT pk_consumed_event PRIMARY KEY (consumer, event_id)
);

-- 保留期清理要按时间扫，没有这个索引清理任务会全表扫
CREATE INDEX idx_consumed_event_consumed_at ON common.consumed_event (consumed_at);

COMMENT ON TABLE common.consumed_event IS '事件消费去重表；按保留期定期删除旧行，不分区（量级远低于 event_publication）';
