-- V48: admin 模块解体 —— auth 改名 account 并收编平台员工与买家地址，店铺审核并入 shop
-- 目标形态里没有按角色切的模块：account 拥有 users / staff 两种主体与买家收货地址（模块 = 顶层包 = schema），
-- 店铺审核是店铺状态机的一段，记录与店铺同 schema、审批同事务推进状态，不再靠两个事件互相同步。
-- 表结构与索引原样搬（RENAME / SET SCHEMA 连索引一起走）；接口路径（/auth/*、/admin/auth/*、/admin/reviews、/user/addresses）不变。

ALTER SCHEMA auth RENAME TO account;
ALTER TABLE admin.staff SET SCHEMA account;
ALTER TABLE user_profile.addresses SET SCHEMA account;
ALTER TABLE admin.shop_reviews SET SCHEMA shop;

DROP SCHEMA admin;
DROP SCHEMA user_profile;
