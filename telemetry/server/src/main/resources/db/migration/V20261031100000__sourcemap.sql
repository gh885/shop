-- sourcemap：前端堆栈能被读懂的唯一前提。
--
-- 键选 debug_id 而不是 (release, filename)：文件名在每次构建都会变（hash 后缀），
-- 而 debug_id 是 @sentry/bundler-plugin 注入到产物里的稳定标识，事件里的
-- debug_meta.images[].debug_id 与之对得上——**不依赖版本号字符串匹配**，
-- 这正是"符号表永远对不上"这个老问题的根治方式。
SET lock_timeout = '3s';
SET statement_timeout = '60s';

CREATE TABLE telemetry.sourcemap
(
    project_id  text        NOT NULL,
    debug_id    text        NOT NULL,
    bundle_url  text,
    content     jsonb       NOT NULL,
    uploaded_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT pk_sourcemap PRIMARY KEY (project_id, debug_id),
    -- debug id 是 UUID 形状：带连字符的 36 位（sentry 的标准）或纯 32 位（部分工具）
    CONSTRAINT ck_sourcemap_debug_id CHECK (
        debug_id ~ '^[0-9a-f]{32}$' OR debug_id ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$')
);

COMMENT ON TABLE telemetry.sourcemap IS '上传即校验：不合法的 map 在写入前就被拒，不落脏数据';
COMMENT ON COLUMN telemetry.sourcemap.bundle_url IS '产物 URL，用于按 code_file 匹配帧；单 chunk 时可空';
