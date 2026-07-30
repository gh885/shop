-- V4: users.id 迁移为 uuidv7（全库统一 ID 策略，见 docs/product-architecture.md）
-- 存量行重新生成 UUID；dev 环境无保留数据需求

ALTER TABLE auth.users ALTER COLUMN id DROP IDENTITY;
ALTER TABLE auth.users ALTER COLUMN id TYPE UUID USING uuidv7();
ALTER TABLE auth.users ALTER COLUMN id SET DEFAULT uuidv7();
