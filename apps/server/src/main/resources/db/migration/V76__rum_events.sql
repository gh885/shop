-- V76: Rum 模块的存储层 —— 一条前端事件一行（rum.rum_events）
--
-- 动机：这条链路此前只有两个出口——Prometheus 计数与日志行，两个都只回答「多少条」。
-- 而排查要问的是另外三个：「这个错误影响了多少个会话」「最近一小时哪个页面在坏」
-- 「把其中一个问题的堆栈和面包屑给我看」。本表把每条事件落成一行，前两问靠列与索引，
-- 第三问靠 payload 里的现场。
--
-- 列怎么划：**契约字段进列，kind 专有字段进 payload**。
--   信封（app / version / env / route / session_id / user_id / ts）是 frontend-monitoring.md
--   契约 1 定死的东西，稳定、要按它过滤，进列。各种 kind 各自的字段还会长——
--   提前替每种 kind 铺一排可空列，等于替将来的自己猜，而猜错的代价是一次带锁的 DDL。
--   所以只把「各 kind 都要用、且注定会被查」的 name / fingerprint / message 提出来，
--   其余（stack、面包屑、device、duration、status、value…）整段进 payload。
--
-- payload 存的是**整条事件的副本**，不是「列没提到的那部分」：重复那几百字节，换的是
-- 「哪天发现某个字段该提出来做列时，历史数据还在原件里躺着」，以及「列的提取逻辑改了，
-- 老数据不会因此变成半截」。在这个量级上这笔买卖是划算的。
-- 它同时也是**脱敏之后**的那一份——加工链在消费端、落库也在消费端，写进来的就是已抹掉
-- 手机号/token 的版本（见 PiiRedactionProcessor）。
--
-- **不分区**（2026-10 的决定，附触发器）：按 created_at 做范围分区能把保留期变成瞬时 DROP，
-- 代价是「谁负责建下个月的分区」——PG 不会自己建，漏了就是写入砸进默认分区或直接报错，
-- 那是又一个得有人盯着的作业。当前量级不需要它。**触发器：本表行数过千万再上分区**，
-- 到那时保留这件事本来也必然要重新想一遍。
--
-- **保留按 created_at 删，不按 ts**：ts 是客户端给的（设备时钟可以不准，也可以造假），
-- 让一个外部可控的字段决定我们删不删数据，等于把存储上限交给对面。created_at 是我们自己写的。

-- 迁移级超时：任何一步卡在锁上都不许无限期挂住发布（口径见 .squawk.toml / tooling.md）。
-- **必须在第一条语句之前**：squawk 的 require-lock-timeout 是按语句顺序看的，写在 CREATE SCHEMA 之后
-- 就等于「建表那一刻没有超时保护」——而它保护不是「这一句很慢」，是「这一句万一在等锁」。
SET lock_timeout = '5s';
SET statement_timeout = '60s';

CREATE SCHEMA IF NOT EXISTS rum;

CREATE TABLE IF NOT EXISTS rum.rum_events (
    id          UUID PRIMARY KEY DEFAULT uuidv7(),
    ts          TIMESTAMPTZ NOT NULL,               -- 客户端事件时刻（信封 ts）。**不可信**，只做展示与粗排序
    app         VARCHAR(32) NOT NULL,               -- web / seller / admin（分区键带上来，已过白名单）
    kind        VARCHAR(32) NOT NULL,               -- error / performance / api / route / fallback
    version     VARCHAR(64),                        -- 构建标识：把「是哪次发布引入的」答得出来
    env         VARCHAR(64),
    route       VARCHAR(64),                        -- 路由模板。服务端已砍 query/hash、纯数字段折 $id
    session_id  VARCHAR(64),                        -- 会话：算「影响多少个会话」的分母
    user_id     VARCHAR(64),                        -- 已登录才有。它是明细字段，不是指标标签
    name        VARCHAR(64),                        -- 受控名：error 的事件名 / fallback 的 source / performance 的指标
    fingerprint VARCHAR(1000),                      -- 错误指纹：聚合「同一个问题」的键（只有 error 有）
    message     VARCHAR(500),                       -- 自由文本，**已在消费端脱敏**
    payload     JSONB NOT NULL DEFAULT '{}',        -- 整条事件的副本（含 device 与面包屑）
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()  -- 落库时刻（≈消费时刻）。保留期按它算，不按 ts
);

-- 索引在 V77，不在这儿：本仓口径是**索引一律 CONCURRENTLY**，而 CONCURRENTLY 不能跑在事务里，
-- Flyway 见到它会把这句挪到事务外执行——同一个文件里混普通 DDL 会直接报 mixed 检查错。
-- 理由与代价见 V65 与 V77 的头部注释。
