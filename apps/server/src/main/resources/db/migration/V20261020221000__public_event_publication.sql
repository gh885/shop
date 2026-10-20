SET lock_timeout = '3s';
SET statement_timeout = '60s';

-- Spring Modulith 的事件登记表，也就是 outbox 的存储侧：发布和业务写同一个事务落库，
-- 投递成功才写 completion_date。监听器崩了或进程重启，这一行还在，可以补发。
--
-- 为什么它在 public 而不是 common：表名由库写死（一个字符串常量），库里没有任何配置项能换 schema
-- ——JdbcConfigurationProperties 里直接写着 "Setting the schema name is not supported!"。
-- 所以 public 的唯一合法用途就是放第三方库自带的表；业务表一律不进 public。
--
-- 列的形状对齐 spring-modulith-events-jdbc 2.1 的 v2 schema（status / completion_attempts /
-- last_resubmission_date 是 v2 才有的）。不要随手加列，库里认不出多余列不会报错，但升级时会错位。
CREATE TABLE public.event_publication
(
    id                     uuid        NOT NULL,
    listener_id            text        NOT NULL,
    event_type             text        NOT NULL,
    serialized_event       text        NOT NULL,
    publication_date       timestamptz NOT NULL,
    completion_date        timestamptz,
    status                 text,
    completion_attempts    int,
    last_resubmission_date timestamptz,

    CONSTRAINT pk_event_publication PRIMARY KEY (id)
);

-- 补发任务扫「未完成的」，这个索引是它的生命线
CREATE INDEX idx_event_publication_by_completion_date ON public.event_publication (completion_date);

-- 按序列化内容查事件（排查时按 event id 找），hash 索引比 btree 省得多
CREATE INDEX idx_event_publication_serialized_event_hash ON public.event_publication USING hash (serialized_event);

COMMENT ON TABLE public.event_publication IS 'Spring Modulith 事件登记表（outbox 存储侧）；表名与列名由库固定';
