package com.shop.platform.infra.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.shop.platform.common.id.Ids;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
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
    void primaryOperatorGetsEverySellerPermissionAndEveryShopOfItsMerchant() {
        UUID merchant = newMerchant();
        UUID shopA = newShop(merchant, "active");
        UUID shopB = newShop(merchant, "active");
        UUID closedShop = newShop(merchant, "closed");
        UUID primary = newOperator(merchant, true, "active");

        signIn(primary);
        CurrentOperator operator = authorizer.current();

        // 主账号拿的是**本域全部**，不是整张表。这条断言就是域边界的验收：
        // 原来这里写的是 Permission.values()，而主账号实际拿到的是 `SELECT code FROM common.permission`——
        // 于是一个卖家店主拿到了 SUSPENSE_MANAGE（手动退真钱）与 LEDGER_VIEW（全平台余额）。
        assertThat(operator.permissions())
                .containsExactlyInAnyOrderElementsOf(Permission.codesOf(Permission.Domain.SELLER));
        assertThat(operator.permissions())
                .as("卖家主账号绝不能拿到平台域的点")
                .doesNotContainAnyElementsOf(Permission.codesOf(Permission.Domain.ADMIN));
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
        for (Permission platformOnly :
                List.of(Permission.SUSPENSE_MANAGE, Permission.LEDGER_VIEW, Permission.STAFF_MANAGE)) {
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

    /**
     * 域边界的数据面：库里每个码都标了域，且与枚举一致。
     *
     * <p>启动校验只查“枚举 ⇄ 库”的码集合与跨域授予，不查“库里的 domain 列对不对”——
     * 那需要把枚举搬进 {@code Authorizer}，而它已经只为清单做了一次反射。这里补上。
     */
    @Test
    void everyCodeCarriesTheSameDomainInDatabaseAndEnum() {
        Map<String, String> declared = Arrays.stream(Permission.values())
                .collect(Collectors.toMap(
                        Permission::code, permission -> permission.domain().dbValue()));

        Map<String, String> stored = new HashMap<>();
        jdbc.query("SELECT code, domain FROM common.permission", rs -> {
            stored.put(rs.getString("code"), rs.getString("domain"));
        });

        assertThat(stored).as("库里每个码的 domain 必须与枚举一致").isEqualTo(declared);
    }
}
