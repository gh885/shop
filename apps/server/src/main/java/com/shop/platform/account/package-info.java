/**
 * Account 模块 — 账号域：买家（users）与平台员工（staff）两种主体的凭证、会话、设备、资料，以及买家收货地址（addresses）。
 *
 * <p>schema: account。买家走手机验证码/密码登录（/auth/*），员工走工号 + 密码登录（/admin/auth/*）；两套 token 以 kind 区分、
 * 会话互不共享（规则见 docs/business-rules/account.md ACC-25、ACC-27）。员工判权由 infra.security.authz 的拦截器经本模块的 StaffPermissionResolver
 * 实时查岗位解析。收货地址归买家所有、独立于订单存在：order 结算经 account :: api 的 AddressReadQuery 取快照，不拥有地址。
 * 治理动作（封号、员工创建/调权/禁用）与 audit :: api 的 RecordAuditCommand 同事务落审计账本。
 */
@ApplicationModule(
        displayName = "Account",
        allowedDependencies = {"audit :: api"})
package com.shop.platform.account;

import org.springframework.modulith.ApplicationModule;
