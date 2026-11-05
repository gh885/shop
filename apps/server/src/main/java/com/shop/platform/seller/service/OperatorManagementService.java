package com.shop.platform.seller.service;

import com.shop.platform.common.BusinessException;
import com.shop.platform.common.EntityStatus;
import com.shop.platform.common.PasswordPolicy;
import com.shop.platform.infra.security.Authorizer;
import com.shop.platform.infra.security.Permission;
import com.shop.platform.seller.mapper.OperatorManagementMapper;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
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

    /**
     * 不进子账号授予清单的码：商家池里 <b>assignable=false</b> 的那些——动钱、管钥匙、不可逆。
     *
     * <p>从清单推导而不是手写：手写一份就多一处会漂的地方，而漏一个就是资损入口。
     */
    private static final Set<String> GRANTABLE = Permission.assignableCodes();

    private static final Set<String> NON_GRANTABLE = Permission.merchantPoolCodes().stream()
            .filter(code -> !GRANTABLE.contains(code))
            .collect(Collectors.toUnmodifiableSet());

    /** 登录名后缀的形。DTO 的 {@code @Pattern} 与这里的第二道白名单引用同一个常量，不要各写一份。 */
    static final String LOGIN_NAME_PATTERN = "^[A-Za-z0-9._-]{4,32}$";

    // jakarta 的 @Pattern 已占用短名，正则的 Pattern 用全限定
    private static final java.util.regex.Pattern LOGIN_NAME = java.util.regex.Pattern.compile(LOGIN_NAME_PATTERN);
    private static final java.util.regex.Pattern ROLE_CODE = java.util.regex.Pattern.compile("^[a-z0-9_-]{2,32}$");

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
            @NotBlank @Pattern(regexp = LOGIN_NAME_PATTERN, message = "登录名须为 4–32 位字母数字与 _ . -") String loginName,
            @NotBlank String password,
            @NotBlank String displayName,
            List<UUID> roleIds,
            List<UUID> shopIds) {}

    @Transactional
    public UUID createOperator(CreateOperatorRequest request) {
        UUID merchantId = requirePrimary().merchantId();
        if (request.loginName() == null
                || !LOGIN_NAME.matcher(request.loginName()).matches()) {
            throw BusinessException.badRequest("登录名须为 4–32 位字母数字与 _ . -");
        }
        // 子账号登录名 = 主账号登录名 + ":" + 后缀（access-control §90）。login_name 仍是全局唯一单列：
        // 前缀把唯一性收窄到本商家，第一个商家占了 kefu01 不影响第二个商家的客服叫 kefu01。
        // 请求里的 loginName 是后缀，正则不含冒号，前缀不可能由调用方伪造。
        String primaryLoginName = operators
                .findPrimaryLoginName(merchantId)
                .orElseThrow(() -> BusinessException.conflict("PRIMARY_MISSING", "本商家没有主账号"));
        String fullLoginName = primaryLoginName + ":" + request.loginName();
        // 与买家/店主/员工同一条口令强度口径：长度、BCrypt 字节档、黑名单、不得与登录名相同。
        // 之前这里只查长度 8–72，子账号成了全平台唯一没强度策略的口令入口。
        PasswordPolicy.require(request.password(), fullLoginName);
        requireGrantableRefs(merchantId, request.roleIds(), request.shopIds());
        try {
            operators.insertSubOperator(
                    merchantId,
                    fullLoginName,
                    passwordEncoder.encode(request.password()),
                    requireText(request.displayName(), "姓名"));
        } catch (org.springframework.dao.DuplicateKeyException e) {
            throw BusinessException.conflict(com.shop.platform.common.ErrorCodes.LOGIN_NAME_TAKEN, "登录名已被占用");
        }
        UUID created = operators.findSubOperators(merchantId).stream()
                .filter(row -> row.loginName().equals(fullLoginName))
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
        if (!EntityStatus.ALL.contains(status)) {
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

    public record RoleRequest(String code, String name, List<String> permissionCodes, Long maxRefundAmount) {}

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
        replaceRolePermissions(roleId, request.permissionCodes(), request.maxRefundAmount());
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
        replaceRolePermissions(roleId, request.permissionCodes(), request.maxRefundAmount());
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
        // #5 不能给自己写授权。提权的最短路径就是"先给自己加一个角色"，
        // 而现在只有主账号能走到这里——这条不变量此刻恒成立，但恒成立的约束不写，加功能时一定漏。
        if (operatorId.equals(authorizer.current().operatorId())) {
            throw BusinessException.badRequest("不能修改自己的授权");
        }
        requireGrantableRefs(merchantId, roleIds, shopIds);
        // 授权是"主体 × 角色 × 范围"的三元组，一行一个范围：先撤销旧的，再按笛卡尔积逐行写。
        operators.revokeGrants(operatorId);
        if (roleIds != null && !roleIds.isEmpty() && shopIds != null && !shopIds.isEmpty()) {
            for (UUID roleId : roleIds) {
                for (UUID shopId : shopIds) {
                    operators.insertGrant(
                            operatorId, roleId, shopId, authorizer.current().operatorId());
                }
            }
        }
        operators.bumpPermissionVersion(operatorId);
    }

    private void replaceRolePermissions(UUID roleId, List<String> codes, Long cap) {
        List<String> normalized =
                codes == null ? List.of() : codes.stream().distinct().sorted().toList();
        // #1 商家角色 ⊆ assignable 集合。用"减法禁名单"是不够的：平台池的码（shop:review、
        // suspense:refund）既不在 merchantPool 里、也不在 NON_GRANTABLE 里，减法拦不住它们。
        List<String> forbidden = normalized.stream()
                .filter(code -> !Permission.assignableCodes().contains(code))
                .toList();
        if (!forbidden.isEmpty()) {
            throw BusinessException.badRequest("这些权限不可转授给子账号: " + String.join(", ", forbidden));
        }
        operators.clearRolePermissions(roleId);
        if (!normalized.isEmpty()) operators.grantRolePermissions(roleId, normalized);
        operators.updateRoleCap(roleId, capFor(normalized, cap));
        operators.findOperatorsWithRole(roleId).forEach(ref -> operators.bumpPermissionVersion(ref.operatorId()));
    }

    /**
     * #2 含退款码的角色必须有上限（> 0）。不设上限是"勾了退款但忘填上限 → 静默无限授权"，
     * 而它的后果是资损，不是权限错误。
     */
    private static Long capFor(List<String> codes, Long requested) {
        boolean refunds = codes.contains(Permission.AFTER_SALE_CASE_REFUND.code());
        if (!refunds) {
            return null;
        }
        if (requested == null || requested <= 0) {
            throw BusinessException.badRequest("含退款的角色必须设置退款上限（分，且大于 0）");
        }
        return requested;
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
        authorizer.check(Permission.MERCHANT_STAFF_WRITE);
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
