package com.shop.platform.seller.service;

import com.shop.platform.common.BusinessException;
import com.shop.platform.common.PasswordPolicy;
import com.shop.platform.infra.security.Authorizer;
import com.shop.platform.infra.security.Permission;
import com.shop.platform.seller.mapper.OperatorManagementMapper;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import java.util.regex.Pattern;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 子账号与角色管理：主账号专属（每个端点先过 {@code SELLER_STAFF_MANAGE}）。
 *
 * <p><b>授予的两条红线</b>，都在这里拦而不是靠前端不画：
 *
 * <ul>
 *   <li>动钱与管钥匙的码（{@link #NON_GRANTABLE}）不进任何角色——把「同意退款」「审批结算」
 *       授给子账号就是资损入口，「管子账号」授出去等于钥匙可以复印；
 *   <li>角色 / 店铺 / 子账号必须都属于本商家——跨商家挂 id 是水平越权的经典入口。
 * </ul>
 *
 * <p>授权与状态变更一律 bump {@code permission_version}：Authorizer 的判权快照靠它失效。
 */
@Service
public class OperatorManagementService {

    /** 不进子账号授予清单的码：动钱出口 + 管钥匙本身（与 permissions.yaml 的 risk_level=high 同源） */
    private static final List<String> NON_GRANTABLE =
            List.of("ORDER_REFUND_APPROVE", "SETTLEMENT_APPROVE", "SELLER_STAFF_MANAGE");

    private static final Pattern LOGIN_NAME = Pattern.compile("^[A-Za-z0-9._-]{4,32}$");
    private static final Pattern ROLE_CODE = Pattern.compile("^[a-z0-9_-]{2,32}$");

    private final OperatorManagementMapper operators;
    private final PasswordEncoder passwordEncoder;
    private final Authorizer authorizer;

    public OperatorManagementService(
            OperatorManagementMapper operators, PasswordEncoder passwordEncoder, Authorizer authorizer) {
        this.operators = Objects.requireNonNull(operators, "operators");
        this.passwordEncoder = Objects.requireNonNull(passwordEncoder, "passwordEncoder");
        this.authorizer = Objects.requireNonNull(authorizer, "authorizer");
    }

    public record OperatorView(
            UUID id,
            String loginName,
            String displayName,
            String status,
            java.time.Instant createdAt,
            List<RoleView> roles,
            List<OperatorManagementMapper.ShopRow> shops) {}

    public record RoleView(String id, String code, String name, List<String> permissionCodes) {}

    public record ShopView(UUID id, String name, String status) {}

    public List<OperatorView> listOperators() {
        UUID merchantId = requirePrimary().merchantId();
        var rows = operators.findSubOperators(merchantId);
        if (rows.isEmpty()) return List.of();
        List<UUID> ids =
                rows.stream().map(OperatorManagementMapper.OperatorRow::id).toList();
        var rolesByOperator = operators.findRolesByOperators(ids).stream()
                .collect(java.util.stream.Collectors.groupingBy(OperatorManagementMapper.OperatorRoleRow::operatorId));
        var shopsByOperator = operators.findShopsByOperators(ids).stream()
                .collect(java.util.stream.Collectors.groupingBy(OperatorManagementMapper.OperatorShopRow::operatorId));
        return rows.stream()
                .map(row -> new OperatorView(
                        row.id(),
                        row.loginName(),
                        row.displayName(),
                        row.status(),
                        row.createdAt(),
                        rolesByOperator.getOrDefault(row.id(), List.of()).stream()
                                .map(r -> new RoleView(r.roleId().toString(), r.code(), r.name(), List.of()))
                                .toList(),
                        shopsByOperator.getOrDefault(row.id(), List.of()).stream()
                                .map(s -> new OperatorManagementMapper.ShopRow(s.shopId(), s.name(), null))
                                .toList()))
                .toList();
    }

    public record CreateOperatorRequest(
            String loginName, String password, String displayName, List<UUID> roleIds, List<UUID> shopIds) {}

    @Transactional
    public UUID createOperator(CreateOperatorRequest request) {
        UUID merchantId = requirePrimary().merchantId();
        if (request.loginName() == null
                || !LOGIN_NAME.matcher(request.loginName()).matches()) {
            throw BusinessException.badRequest("登录名须为 4–32 位字母数字与 _ . -");
        }
        // 与买家/店主/员工同一条口令强度口径：长度、BCrypt 字节档、黑名单、不得与登录名相同。
        // 之前这里只查长度 8–72，子账号成了全平台唯一没强度策略的口令入口。
        PasswordPolicy.require(request.password(), request.loginName());
        requireGrantableRefs(merchantId, request.roleIds(), request.shopIds());
        try {
            operators.insertSubOperator(
                    merchantId,
                    request.loginName(),
                    passwordEncoder.encode(request.password()),
                    requireText(request.displayName(), "姓名"));
        } catch (org.springframework.dao.DuplicateKeyException e) {
            throw BusinessException.conflict(com.shop.platform.common.ErrorCodes.LOGIN_NAME_TAKEN, "登录名已被占用");
        }
        UUID created = operators.findSubOperators(merchantId).stream()
                .filter(row -> row.loginName().equals(request.loginName()))
                .findFirst()
                .orElseThrow()
                .id();
        applyGrants(created, request.roleIds(), request.shopIds(), merchantId);
        return created;
    }

    public record UpdateOperatorRequest(String displayName, List<UUID> roleIds, List<UUID> shopIds) {}

    @Transactional
    public void updateOperator(UUID operatorId, UpdateOperatorRequest request) {
        UUID merchantId = requirePrimary().merchantId();
        var operator = requireOperator(operatorId, merchantId);
        if (request.displayName() != null && !request.displayName().isBlank()) {
            operators.updateDisplayName(operator.id(), request.displayName().trim());
        }
        applyGrants(operator.id(), request.roleIds(), request.shopIds(), merchantId);
    }

    @Transactional
    public void updateStatus(UUID operatorId, String status) {
        UUID merchantId = requirePrimary().merchantId();
        var operator = requireOperator(operatorId, merchantId);
        if (!"active".equals(status) && !"disabled".equals(status)) {
            throw BusinessException.badRequest("状态只能是 active / disabled: " + status);
        }
        operators.updateStatus(operator.id(), status);
        operators.bumpPermissionVersion(operator.id());
    }

    @Transactional
    public void resetPassword(UUID operatorId, String password) {
        UUID merchantId = requirePrimary().merchantId();
        var operator = requireOperator(operatorId, merchantId);
        PasswordPolicy.require(password, operator.loginName());
        operators.updatePassword(operator.id(), passwordEncoder.encode(password));
    }

    // ---- 角色 ----

    public List<RoleView> listRoles() {
        UUID merchantId = requirePrimary().merchantId();
        var roles = operators.findRoles(merchantId);
        var permissionsByRole = operators.findPermissionsByMerchant(merchantId).stream()
                .collect(java.util.stream.Collectors.groupingBy(OperatorManagementMapper.RolePermissionRow::roleId));
        return roles.stream()
                .map(role -> new RoleView(
                        role.id().toString(),
                        role.code(),
                        role.name(),
                        permissionsByRole.getOrDefault(role.id(), List.of()).stream()
                                .map(OperatorManagementMapper.RolePermissionRow::permissionCode)
                                .sorted()
                                .toList()))
                .toList();
    }

    public record RoleRequest(String code, String name, List<String> permissionCodes) {}

    @Transactional
    public UUID createRole(RoleRequest request) {
        UUID merchantId = requirePrimary().merchantId();
        requireRoleRequest(request);
        try {
            operators.insertRole(merchantId, request.code(), request.name().trim());
        } catch (org.springframework.dao.DuplicateKeyException e) {
            throw BusinessException.conflict("ROLE_CODE_TAKEN", "角色编码已被占用");
        }
        UUID roleId = operators.findRoles(merchantId).stream()
                .filter(role -> role.code().equals(request.code()))
                .findFirst()
                .orElseThrow()
                .id();
        replaceRolePermissions(roleId, request.permissionCodes());
        return roleId;
    }

    @Transactional
    public void updateRole(UUID roleId, RoleRequest request) {
        UUID merchantId = requirePrimary().merchantId();
        requireOwnedRole(roleId, merchantId);
        if (request.name() == null || request.name().isBlank()) {
            throw BusinessException.badRequest("角色名称不能为空");
        }
        operators.updateRoleName(roleId, request.name().trim());
        replaceRolePermissions(roleId, request.permissionCodes());
    }

    @Transactional
    public void deleteRole(UUID roleId) {
        UUID merchantId = requirePrimary().merchantId();
        requireOwnedRole(roleId, merchantId);
        List<UUID> holders = operators.findOperatorsWithRole(roleId).stream()
                .map(OperatorManagementMapper.OperatorRoleRef::operatorId)
                .toList();
        if (!holders.isEmpty()) {
            throw BusinessException.conflict("ROLE_IN_USE", "角色还挂在 " + holders.size() + " 个子账号上，先解除授权再删除");
        }
        operators.clearRolePermissions(roleId);
        operators.deleteRole(roleId, merchantId);
    }

    public List<ShopView> listShops() {
        UUID merchantId = requirePrimary().merchantId();
        return operators.findMerchantShops(merchantId).stream()
                .map(shop -> new ShopView(shop.id(), shop.name(), shop.status()))
                .toList();
    }

    // ---- 内部 ----

    private void applyGrants(UUID operatorId, List<UUID> roleIds, List<UUID> shopIds, UUID merchantId) {
        requireGrantableRefs(merchantId, roleIds, shopIds);
        operators.clearOperatorRoles(operatorId);
        if (roleIds != null && !roleIds.isEmpty()) operators.grantRoles(operatorId, roleIds);
        operators.clearOperatorShops(operatorId);
        if (shopIds != null && !shopIds.isEmpty()) operators.grantShops(operatorId, shopIds);
        operators.bumpPermissionVersion(operatorId);
    }

    private void replaceRolePermissions(UUID roleId, List<String> codes) {
        List<String> normalized =
                codes == null ? List.of() : codes.stream().distinct().sorted().toList();
        List<String> forbidden = new ArrayList<>(normalized);
        forbidden.retainAll(NON_GRANTABLE);
        if (!forbidden.isEmpty()) {
            throw BusinessException.badRequest("这些权限不进子账号授予清单: " + String.join(", ", forbidden));
        }
        operators.clearRolePermissions(roleId);
        if (!normalized.isEmpty()) operators.grantRolePermissions(roleId, normalized);
        operators.findOperatorsWithRole(roleId).forEach(ref -> operators.bumpPermissionVersion(ref.operatorId()));
    }

    private void requireGrantableRefs(UUID merchantId, List<UUID> roleIds, List<UUID> shopIds) {
        if (roleIds != null && !roleIds.isEmpty()) {
            var owned = operators.findOwnedRoles(merchantId, roleIds);
            if (owned.size() != roleIds.stream().distinct().count()) {
                throw BusinessException.badRequest("角色不存在或不属于本商家");
            }
        }
        if (shopIds != null && !shopIds.isEmpty()) {
            var owned = operators.findOwnedShopIds(merchantId, shopIds);
            if (owned.size() != shopIds.stream().distinct().count()) {
                throw BusinessException.badRequest("店铺不存在或不属于本商家");
            }
        }
    }

    private void requireRoleRequest(RoleRequest request) {
        if (request.code() == null || !ROLE_CODE.matcher(request.code()).matches()) {
            throw BusinessException.badRequest("角色编码须为 2–32 位小写字母数字与 _ -");
        }
        requireText(request.name(), "角色名称");
    }

    private void requireOwnedRole(UUID roleId, UUID merchantId) {
        if (operators.findRole(roleId, merchantId).isEmpty()) {
            throw BusinessException.notFound("角色不存在: " + roleId);
        }
    }

    private OperatorManagementMapper.OperatorRow requireOperator(UUID operatorId, UUID merchantId) {
        return operators
                .findSubOperator(operatorId, merchantId)
                .orElseThrow(() -> BusinessException.notFound("子账号不存在: " + operatorId));
    }

    private String requireText(String value, String label) {
        if (value == null || value.isBlank()) {
            throw BusinessException.badRequest(label + "不能为空");
        }
        return value.trim();
    }

    /** 主账号专属：先过权限码，再认身份——权限码由主账号全量持有，子账号按理拿不到，双保险防授错 */
    private com.shop.platform.infra.security.CurrentOperator requirePrimary() {
        authorizer.check(Permission.SELLER_STAFF_MANAGE);
        var operator = authorizer.current();
        if (!com.shop.platform.infra.security.CurrentOperator.TYPE_SELLER.equals(operator.operatorType())) {
            throw BusinessException.forbidden("STAFF_ONLY", "只有商家主账号可以管理子账号");
        }
        if (operators.isPrimary(operator.operatorId()).orElse(false) == false) {
            throw BusinessException.forbidden("PRIMARY_ONLY", "只有主账号可以管理子账号");
        }
        return operator;
    }
}
