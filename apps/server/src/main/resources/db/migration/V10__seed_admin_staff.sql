-- V10: Admin 模块 — 初始平台管理员（seed）
-- 固定 UUID（01900000 前缀），便于测试/前端引用；默认账号 admin / admin123，仅开发环境，上线前必须改密
-- 密码 hash 为 BCrypt(admin123)，由 spring-security-crypto 生成

INSERT INTO admin.staff (id, employee_no, password_hash, display_name, status) VALUES
('01900000-0000-7000-8000-000000000001', 'admin', '$2a$10$Wf8BbLJ9RxMxBOZDGmkSceyeNyJEsxEyaak4hH8AFD90PQirYNNsq', '平台管理员', 'ACTIVE');
