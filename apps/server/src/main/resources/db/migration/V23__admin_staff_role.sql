-- V23: 权限系统 P0 —— 平台员工岗位列（docs/permission-implementation.md「权限码表」）
-- 岗位→权限码映射收敛在代码枚举（admin/service/StaffRole），库里只存岗位名。

ALTER TABLE admin.staff ADD COLUMN role VARCHAR(20);

-- 存量 seed 账号升级为超管（V10 固定 UUID）
UPDATE admin.staff SET role = 'SUPER_ADMIN' WHERE employee_no = 'admin';

-- 其余存量默认审核岗（当前唯一业务就是入驻审核）；新建员工必须显式给岗，
-- 故意不留 DEFAULT：漏写 = 插入报错，而不是静默变 REVIEWER
UPDATE admin.staff SET role = 'REVIEWER' WHERE role IS NULL;

ALTER TABLE admin.staff ALTER COLUMN role SET NOT NULL;
