package com.shop.platform.account.mapper;

import com.baomidou.mybatisplus.annotation.TableName;
import com.shop.platform.account.model.StaffStatus;
import com.shop.platform.infra.db.AuditedEntity;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;
import lombok.experimental.SuperBuilder;

/**
 * 平台员工 —— 平台官方人员（apps/admin 的受众），与买家/卖家（account.users）是两套独立账号体系。
 *
 * <p>登录凭证是工号 + 密码，不走手机验证码；登录入口、token 范围与 C 端隔离（token 规则见 docs/business-rules/account.md ACC-19、ACC-25）。
 */
@Data
@SuperBuilder
@NoArgsConstructor
@EqualsAndHashCode(callSuper = true)
@TableName("account.staff")
public class Staff extends AuditedEntity {

    /** 工号。登录账号，全局唯一，唯一索引 uk_staff_employee_no 兜底并发；由管理员创建，员工不自助注册 */
    private String employeeNo;

    /** 密码哈希（BCrypt）。平台员工登录必填密码，与 user.password_hash 同风格 */
    private String passwordHash;

    /** 真名/展示名，可空 */
    private String displayName;

    /** 员工状态：正常/禁用，概念归 {@link StaffStatus}；不做物理删除 */
    private StaffStatus status;

    /** 是否可登录/操作后台的闸门 */
    public boolean isActive() {
        return status != null && status.isActive();
    }

    /** 岗位：StaffRole 枚举名（SUPER_ADMIN/REVIEWER/OPS），库里只存岗位名 */
    private String role;
}
