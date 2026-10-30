-- 只在数据卷首次初始化时执行（docker-entrypoint-initdb.d 的语义），已存在数据卷不会重跑。
-- 两个库分开：shop 给本地开发手工造数据，shop_test 给 mvn test 跑迁移建表。
CREATE DATABASE shop_test;

-- 自建采集平台。独立库的原因见 telemetry/server/src/main/resources/db/migration 首条迁移头注释。
-- 已存在数据卷不会重跑本文件，那种情况执行一次：psql -h 127.0.0.1 -p 15432 -U shop -d shop -c 'CREATE DATABASE telemetry'
CREATE DATABASE telemetry;
