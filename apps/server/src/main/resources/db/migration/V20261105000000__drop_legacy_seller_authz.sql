SET lock_timeout = '3s';
SET statement_timeout = '60s';

-- 旧的卖家授权表退役。解析器已经全部改读 `authz.*`（{@code SellerOperatorResolver}、
-- {@code OperatorManagementMapper}、{@code Authorizer} 的启动校验），搬迁在
-- V20261103000000 里做过——所以到这里删是安全的。
--
-- 顺序回顾：**搬 → 切读 → 删。** 在同一条迁移里既搬又删就没有退路，
-- 而这个项目已经证明过"权限来源静默错"是最难查的一类故障。
DROP TABLE IF EXISTS seller.operator_role;
DROP TABLE IF EXISTS seller.operator_shop;
DROP TABLE IF EXISTS seller.role_permission;
DROP TABLE IF EXISTS seller.role;
