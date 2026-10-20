-- 只在数据卷首次初始化时执行（docker-entrypoint-initdb.d 的语义），已存在数据卷不会重跑。
-- 两个库分开：shop 给本地开发手工造数据，shop_test 给 mvn test 跑迁移建表。
CREATE DATABASE shop_test;
