package com.shop.platform.infra.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.shop.platform.common.id.Ids;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.context.ActiveProfiles;

@SpringBootTest
@ActiveProfiles("test")
class AuthorizerTest {

    @Autowired
    private Authorizer authorizer;

    /**
     * 三套身份域各有自己的实现，所以按类型注入会撞上两个。
     *
     * <p>这里显式点名卖家那个：本测试验的是卖家那套角色 + 店铺范围的判定，
     * 买家那份没有权限点也没有店铺，验不了这些规则。
     */
    @Autowired
    @Qualifier("sellerOperatorResolver")
    private OperatorResolver resolver;

    @Autowired
    private JdbcTemplate jdbc;

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
                "INSERT INTO seller.role (merchant_id, code, name) VALUES (?, ?, ?) RETURNING id",
                UUID.class,
                merchantId,
                "role-" + Ids.newId(),
                "客服");
    }

    private void grantPermission(UUID roleId, Permission permission) {
        jdbc.update(
                "INSERT INTO seller.role_permission (role_id, permission_code) VALUES (?, ?)",
                roleId,
                permission.code());
    }

    private void assignRole(UUID operatorId, UUID roleId) {
        jdbc.update("INSERT INTO seller.operator_role (operator_id, role_id) VALUES (?, ?)", operatorId, roleId);
    }

    private void grantShop(UUID operatorId, UUID shopId) {
        jdbc.update("INSERT INTO seller.operator_shop (operator_id, shop_id) VALUES (?, ?)", operatorId, shopId);
    }

    @Test
    void primaryOperatorGetsEveryPermissionAndEveryActiveShopOfItsMerchant() {
        UUID merchant = newMerchant();
        UUID shopA = newShop(merchant, "active");
        UUID shopB = newShop(merchant, "active");
        UUID closedShop = newShop(merchant, "closed");
        UUID primary = newOperator(merchant, true, "active");

        signIn(primary);
        CurrentOperator operator = authorizer.current();

        assertThat(operator.permissions())
                .containsExactlyInAnyOrderElementsOf(
                        Arrays.stream(Permission.values()).map(Permission::code).toList());
        assertThat(operator.shopIds()).containsExactlyInAnyOrder(shopA, shopB);
        assertThat(operator.shopIds()).doesNotContain(closedShop);
    }

    @Test
    void subOperatorGetsOnlyItsRolePermissionsAndOnlyTheShopsItWasGranted() {
        UUID merchant = newMerchant();
        UUID shopA = newShop(merchant, "active");
        UUID shopB = newShop(merchant, "active");
        UUID sub = newOperator(merchant, false, "active");
        UUID role = newRole(merchant);
        grantPermission(role, Permission.ORDER_READ);
        assignRole(sub, role);
        grantShop(sub, shopA);

        signIn(sub);
        CurrentOperator operator = authorizer.current();

        assertThat(operator.has(Permission.ORDER_READ)).isTrue();
        assertThat(operator.has(Permission.ORDER_REFUND)).isFalse();
        assertThat(operator.permissions()).hasSize(1);
        assertThat(operator.shopIds()).containsExactly(shopA);
        assertThat(operator.shopIds()).doesNotContain(shopB);
    }

    @Test
    void multipleRolesAreUnioned() {
        UUID merchant = newMerchant();
        UUID sub = newOperator(merchant, false, "active");
        UUID customerService = newRole(merchant);
        UUID operations = newRole(merchant);
        grantPermission(customerService, Permission.ORDER_READ);
        grantPermission(operations, Permission.PRODUCT_WRITE);
        assignRole(sub, customerService);
        assignRole(sub, operations);

        signIn(sub);

        assertThat(authorizer.current().permissions())
                .containsExactlyInAnyOrder(Permission.ORDER_READ.code(), Permission.PRODUCT_WRITE.code());
    }

    @Test
    void checkingAPermissionTheOperatorLacksIsRejected() {
        UUID merchant = newMerchant();
        UUID sub = newOperator(merchant, false, "active");

        signIn(sub);

        assertThatThrownBy(() -> authorizer.check(Permission.ORDER_REFUND))
                .isInstanceOf(ForbiddenException.class)
                .hasMessageContaining("缺少权限");
    }

    @Test
    void reachingAShopOutsideTheDataScopeIsRejected() {
        UUID merchant = newMerchant();
        UUID mine = newShop(merchant, "active");
        UUID someoneElses = newShop(merchant, "active");
        UUID sub = newOperator(merchant, false, "active");
        grantShop(sub, mine);

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

    @Test
    void permissionCatalogueInDatabaseMatchesTheEnum() {
        assertThat(jdbc.queryForList("SELECT code FROM common.permission", String.class))
                .containsExactlyInAnyOrderElementsOf(
                        Arrays.stream(Permission.values()).map(Permission::code).toList());
    }
}
