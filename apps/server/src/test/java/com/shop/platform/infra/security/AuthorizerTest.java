package com.shop.platform.infra.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.shop.platform.common.id.Ids;
import com.shop.platform.testsupport.IntegrationTest;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;

class AuthorizerTest extends IntegrationTest {

    @Autowired
    private Authorizer authorizer;

    /** 启动校验测试直接构造 Authorizer 用——它吃的是 JdbcClient，不是基线里的 JdbcTemplate。 */
    @Autowired
    private JdbcClient jdbcClient;

    /**
     * 三套身份域各有自己的实现，所以按类型注入会撞上两个。
     *
     * <p>这里显式点名卖家那个：本测试验的是卖家那套角色 + 店铺范围的判定，
     * 买家那份没有权限点也没有店铺，验不了这些规则。
     */
    @Autowired
    @Qualifier("sellerOperatorResolver")
    private OperatorResolver resolver;

    @AfterEach
    void clearContext() {
        SecurityContextHolder.clearContext();
    }

    /** 模拟认证过滤器干的事：把人解析出来放进 SecurityContext。 */
    private void signIn(UUID operatorId) {
        CurrentOperator operator = resolver.find(operatorId).orElseThrow();
        SecurityContext context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(new UsernamePasswordAuthenticationToken(operator, null, List.of()));
        SecurityContextHolder.setContext(context);
    }

    private UUID newMerchant() {
        return jdbc.queryForObject(
                "INSERT INTO seller.merchant (name) VALUES (?) RETURNING id", UUID.class, "商家-" + Ids.newId());
    }

    private UUID newShop(UUID merchantId, String status) {
        return jdbc.queryForObject(
                "INSERT INTO seller.shop (merchant_id, name, status) VALUES (?, ?, ?) RETURNING id",
                UUID.class,
                merchantId,
                "店-" + Ids.newId(),
                status);
    }

    private UUID newOperator(UUID merchantId, boolean primary, String status) {
        return jdbc.queryForObject(
                """
                INSERT INTO seller.operator (merchant_id, login_name, password_hash, display_name, is_primary, status)
                VALUES (?, ?, ?, ?, ?, ?) RETURNING id
                """,
                UUID.class,
                merchantId,
                "login-" + Ids.newId(),
                "x",
                "测试账号",
                primary,
                status);
    }

    private UUID newRole(UUID merchantId) {
        return jdbc.queryForObject(
                "INSERT INTO authz.role (owner_kind, owner_id, code, name) VALUES ('merchant', ?, ?, ?) RETURNING id",
                UUID.class,
                merchantId,
                "role-" + Ids.newId(),
                "客服");
    }

    private void grantPermission(UUID roleId, Permission permission) {
        jdbc.update(
                "INSERT INTO authz.role_permission (role_id, permission_code) VALUES (?, ?)",
                roleId,
                permission.code());
    }

    /** 平台专属：{@code pool} 不含 merchant 的那些码。 */
    private static java.util.Set<String> platformOnlyCodes() {
        java.util.Set<String> codes = new java.util.HashSet<>(Permission.codes());
        codes.removeAll(Permission.merchantPoolCodes());
        return codes;
    }

    /** 授权是"主体 × 角色 × 范围"的三元组，一行一个范围——所以测试里也必须一次给齐。 */
    private void grant(UUID operatorId, UUID roleId, UUID shopId) {
        jdbc.update(
                "INSERT INTO authz.role_grant (subject_type, subject_id, role_id, scope_kind, scope_shop_id,"
                        + " granted_by_type, granted_by_id) VALUES ('seller', ?, ?, 'shop', ?, 'seller', ?)",
                operatorId,
                roleId,
                shopId,
                operatorId);
    }

    /** 角色退款上限：直接落列——写侧的「退款角色必须带上限」校验是 OperatorManagementService 的事。 */
    private void setRefundCap(UUID roleId, Long cap) {
        jdbc.update("UPDATE authz.role SET max_refund_amount = ? WHERE id = ?", cap, roleId);
    }

    /**
     * 退款上限的求值口径：主账号 = 内置店长，不限；子账号 = 各退款角色上限的 max，
     * 没带退款码的角色不参与，任一退款角色不限（NULL）则整体不限。
     */
    @Test
    void refundCapIsTheMaxOverRefundRolesAndUnlimitedForPrimary() {
        UUID merchant = newMerchant();
        UUID shop = newShop(merchant, "active");

        UUID primary = newOperator(merchant, true, "active");
        assertThat(resolver.find(primary).orElseThrow().refundCap()).isNull();

        UUID sub = newOperator(merchant, false, "active");
        UUID bigRole = newRole(merchant);
        UUID smallRole = newRole(merchant);
        UUID readOnlyRole = newRole(merchant);
        grantPermission(bigRole, Permission.AFTER_SALE_CASE_REFUND);
        grantPermission(smallRole, Permission.AFTER_SALE_CASE_REFUND);
        grantPermission(readOnlyRole, Permission.ORDER_READ);
        setRefundCap(bigRole, 50_000L);
        setRefundCap(smallRole, 30_000L);
        grant(sub, bigRole, shop);
        grant(sub, smallRole, shop);
        grant(sub, readOnlyRole, shop);

        // 只读角色的 NULL 上限不参与——上限是 50_000 而不是被它折成"不限"
        assertThat(resolver.find(sub).orElseThrow().refundCap()).isEqualTo(50_000L);

        // 加一个不限的退款角色：权限是并集，上限跟着取并集 → 不限
        UUID unlimitedRole = newRole(merchant);
        grantPermission(unlimitedRole, Permission.AFTER_SALE_CASE_REFUND);
        grant(sub, unlimitedRole, shop);
        assertThat(resolver.find(sub).orElseThrow().refundCap()).isNull();
    }

    @Test
    void primaryOperatorGetsEverySellerPermissionAndEveryShopOfItsMerchant() {
        UUID merchant = newMerchant();
        UUID shopA = newShop(merchant, "active");
        UUID shopB = newShop(merchant, "active");
        UUID closedShop = newShop(merchant, "closed");
        UUID primary = newOperator(merchant, true, "active");

        signIn(primary);
        CurrentOperator operator = authorizer.current();

        // 主账号拿的是**商家池全部**，不是整张表。这条断言就是池边界的验收：
        // 原来这里写的是 Permission.values()，而主账号实际拿到的是 `SELECT code FROM common.permission`——
        // 于是一个卖家店主拿到了手动退真钱与全平台余额。现在清单里每个码显式标 pool。
        assertThat(operator.permissions()).containsExactlyInAnyOrderElementsOf(Permission.merchantPoolCodes());
        assertThat(operator.permissions()).as("卖家主账号绝不能拿到平台域的点").doesNotContainAnyElementsOf(platformOnlyCodes());
        // 范围含已关店：关店只是不再经营，历史订单与遗留模板还是他家的——
        // 按 active 过滤会让主账号丢掉自己关掉的店的数据（而子账号的授权店由 operator_shop 决定）
        assertThat(operator.shopIds()).containsExactlyInAnyOrder(shopA, shopB, closedShop);
    }

    @Test
    void sellerCannotReachAnyAdminOnlyAction() {
        UUID merchant = newMerchant();
        UUID primary = newOperator(merchant, true, "active");

        signIn(primary);

        // 三个具体例子：都是“一个卖家店主不该能干的事”。逐个点名而不是只查集合，
        // 因为集合断言只说“不包含”，说不清是哪个点漏了。
        for (Permission platformOnly : List.of(
                Permission.SUSPENSE_REFUND,
                Permission.RECONCILIATION_STATEMENT_READ,
                Permission.PLATFORM_STAFF_WRITE)) {
            assertThatThrownBy(() -> authorizer.check(platformOnly))
                    .as("卖家主账号不该持有 %s", platformOnly.code())
                    .isInstanceOf(ForbiddenException.class);
        }
    }

    @Test
    void subOperatorGetsOnlyItsRolePermissionsAndOnlyTheShopsItWasGranted() {
        UUID merchant = newMerchant();
        UUID shopA = newShop(merchant, "active");
        UUID shopB = newShop(merchant, "active");
        UUID sub = newOperator(merchant, false, "active");
        UUID role = newRole(merchant);
        grantPermission(role, Permission.ORDER_READ);
        grant(sub, role, shopA);

        signIn(sub);
        CurrentOperator operator = authorizer.current();

        assertThat(operator.has(Permission.ORDER_READ)).isTrue();
        assertThat(operator.has(Permission.AFTER_SALE_CASE_HANDLE)).isFalse();
        assertThat(operator.permissions()).hasSize(1);
        assertThat(operator.shopIds()).containsExactly(shopA);
        assertThat(operator.shopIds()).doesNotContain(shopB);
        // 没有退款角色 → 上限为 null（与"不限"同形，但判权已经挡住，轮不到上限被问）
        assertThat(operator.refundCap()).isNull();
    }

    @Test
    void multipleRolesAreUnioned() {
        UUID merchant = newMerchant();
        UUID sub = newOperator(merchant, false, "active");
        UUID shop = newShop(merchant, "active");
        UUID customerService = newRole(merchant);
        UUID operations = newRole(merchant);
        grantPermission(customerService, Permission.ORDER_READ);
        grantPermission(operations, Permission.PRODUCT_WRITE);
        grant(sub, customerService, shop);
        grant(sub, operations, shop);

        signIn(sub);

        assertThat(authorizer.current().permissions())
                .containsExactlyInAnyOrder(Permission.ORDER_READ.code(), Permission.PRODUCT_WRITE.code());
    }

    @Test
    void checkingAPermissionTheOperatorLacksIsRejected() {
        UUID merchant = newMerchant();
        UUID sub = newOperator(merchant, false, "active");

        signIn(sub);

        assertThatThrownBy(() -> authorizer.check(Permission.AFTER_SALE_CASE_HANDLE))
                .isInstanceOf(ForbiddenException.class)
                .hasMessageContaining("缺少权限");
    }

    @Test
    void reachingAShopOutsideTheDataScopeIsRejected() {
        UUID merchant = newMerchant();
        UUID mine = newShop(merchant, "active");
        UUID someoneElses = newShop(merchant, "active");
        UUID sub = newOperator(merchant, false, "active");
        UUID role = newRole(merchant);
        grant(sub, role, mine);

        signIn(sub);

        authorizer.checkShop(mine);
        assertThatThrownBy(() -> authorizer.checkShop(someoneElses))
                .isInstanceOf(ForbiddenException.class)
                .hasMessageContaining("无权操作店铺");
    }

    @Test
    void disabledOperatorCannotBeResolved() {
        UUID merchant = newMerchant();
        UUID disabled = newOperator(merchant, false, "disabled");

        assertThat(resolver.find(disabled)).isEmpty();
    }

    @Test
    void withoutAContextEverythingIsForbiddenNoAnonymityFallback() {
        assertThatThrownBy(() -> authorizer.check(Permission.ORDER_READ))
                .isInstanceOf(ForbiddenException.class)
                .hasMessageContaining("没有操作人上下文");
        assertThat(authorizer.has(Permission.ORDER_READ)).isFalse();
    }

    /**
     * 三个工厂各认各的池：凭据只发给对的身份，错池令牌在类型这一关就断——
     * 不等"集合里恰好没有这个码"这种碰运气的拒绝。
     */
    @Test
    void factoryIssuesACredentialForItsOwnPoolAndRejectsTheOthers() {
        UUID merchant = newMerchant();
        UUID shop = newShop(merchant, "active");
        UUID primary = newOperator(merchant, true, "active");

        // 卖家令牌：seller() 发凭据（归属 + 店铺范围都在），另两个池当场拒
        signIn(primary);
        AccessScope.Seller seller = authorizer.seller(Permission.ORDER_READ);
        assertThat(seller.merchantId()).isEqualTo(merchant);
        assertThat(seller.shopIds()).containsExactly(shop);
        assertThatThrownBy(() -> authorizer.platform(Permission.JOB_TRIGGER))
                .isInstanceOf(ForbiddenException.class)
                .hasMessageContaining("只有平台员工");
        assertThatThrownBy(() -> authorizer.buyer())
                .isInstanceOf(ForbiddenException.class)
                .hasMessageContaining("只有买家");

        // 平台令牌打卖家端点；给平台员工一个真实的岗位权限，验凭据发得出来
        CurrentOperator staff = new CurrentOperator(
                Ids.newId(), CurrentOperator.TYPE_STAFF, null, Set.of(), Set.of(Permission.JOB_TRIGGER.code()));
        Authorizer.runAs(staff, () -> {
            assertThatThrownBy(() -> authorizer.seller(Permission.ORDER_READ))
                    .isInstanceOf(ForbiddenException.class)
                    .hasMessageContaining("只有卖家");
            assertThat(authorizer.platform(Permission.JOB_TRIGGER).subjectId()).isEqualTo(staff.operatorId());
        });

        // 买家令牌：buyer() 只认买家，卖家端点同样类型拒
        Authorizer.runAs(new CurrentOperator(Ids.newId(), CurrentOperator.TYPE_BUYER, null, Set.of(), Set.of()), () -> {
            assertThat(authorizer.buyer().subjectId()).isNotNull();
            assertThatThrownBy(() -> authorizer.seller(Permission.ORDER_READ))
                    .isInstanceOf(ForbiddenException.class)
                    .hasMessageContaining("只有卖家");
        });
    }

    /** 有卖家身份但没有这个权限点：凭据发不出，错误说的是"缺权限"而不是"不是卖家"。 */
    @Test
    void sellerFactoryRejectsAnOperatorWithoutThePermission() {
        UUID merchant = newMerchant();
        UUID sub = newOperator(merchant, false, "active");

        signIn(sub);

        assertThatThrownBy(() -> authorizer.seller(Permission.ORDER_READ))
                .isInstanceOf(ForbiddenException.class)
                .hasMessageContaining("缺少权限");
    }

    /** 启动校验之一：授权表里出现清单外的码，应用起不来——"库里挂了一个没人检查的码"在启动时截住。 */
    @Test
    void refusesToStartWhenAnUnknownCodeSitsInARole() {
        UUID merchant = newMerchant();
        UUID role = newRole(merchant);
        jdbc.update("INSERT INTO authz.role_permission (role_id, permission_code) VALUES (?, ?)", role, "bogus:code");
        try {
            assertThatThrownBy(() -> new Authorizer(jdbcClient))
                    .isInstanceOf(IllegalStateException.class)
                    .hasMessageContaining("没有的权限码");
        } finally {
            jdbc.update("DELETE FROM authz.role_permission WHERE role_id = ?", role);
        }
    }

    /** 启动校验之二：商家角色持有了不可转授的码（动钱、管钥匙），同样起不来。 */
    @Test
    void refusesToStartWhenARoleHoldsANonAssignableCode() {
        UUID merchant = newMerchant();
        UUID role = newRole(merchant);
        grantPermission(role, Permission.SHOP_CLOSE);
        try {
            assertThatThrownBy(() -> new Authorizer(jdbcClient))
                    .isInstanceOf(IllegalStateException.class)
                    .hasMessageContaining("不可转授");
        } finally {
            jdbc.update("DELETE FROM authz.role_permission WHERE role_id = ?", role);
        }
    }
}
