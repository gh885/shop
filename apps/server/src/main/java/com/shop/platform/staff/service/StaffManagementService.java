package com.shop.platform.staff.service;

import com.shop.platform.audit.api.AuditCommand;
import com.shop.platform.audit.api.AuditEntry;
import com.shop.platform.audit.api.FieldChange;
import com.shop.platform.common.BusinessException;
import com.shop.platform.common.EntityStatus;
import com.shop.platform.common.PasswordPolicy;
import com.shop.platform.infra.security.RefreshTokenStore;
import com.shop.platform.staff.mapper.StaffMapper;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 平台员工的管理动作：创建、调岗、禁用/启用。写入只有一个出口。
 *
 * <p>岗位是给人看的，权限点是给代码判的（权限码清单由 contracts/permissions.yaml 生成，
 * 岗位 → 码的映射住 yaml 的 staff_roles）。判权侧每请求实时解析，所以禁用/调岗下一请求即生效，
 * 不需要等令牌过期——禁用额外吊销全部会话，把在途 access 也压掉。
 */
@Service
public class StaffManagementService {

    private static final Logger log = LoggerFactory.getLogger(StaffManagementService.class);

    private final StaffMapper store;
    private final PasswordEncoder passwordEncoder;
    private final RefreshTokenStore refreshTokenStore;
    private final AuditCommand audit;

    public StaffManagementService(
            StaffMapper store,
            PasswordEncoder passwordEncoder,
            RefreshTokenStore refreshTokenStore,
            AuditCommand audit) {
        this.store = Objects.requireNonNull(store, "store");
        this.passwordEncoder = Objects.requireNonNull(passwordEncoder, "passwordEncoder");
        this.refreshTokenStore = Objects.requireNonNull(refreshTokenStore, "refreshTokenStore");
        this.audit = Objects.requireNonNull(audit, "audit");
    }

    /**
     * 创建平台员工。两条闸门：登录名唯一（预检 + 唯一索引双保险）；口令强度走
     * {@link PasswordPolicy}——与买家建密同一份判定。
     */
    @Transactional
    public void create(String loginName, String password, String displayName, String role, UUID operatorId) {
        if (store.existsByLoginName(loginName)) {
            throw BusinessException.badRequest("登录名已被使用，请换一个");
        }
        // 员工无手机号对照物，传 null 跳过那格
        PasswordPolicy.require(password, null);
        try {
            store.insert(loginName, passwordEncoder.encode(password), displayName, role);
        } catch (DuplicateKeyException e) {
            // 并发下两人同取一号：唯一索引是真相，给与预检一致的 400
            throw BusinessException.badRequest("登录名已被使用，请换一个");
        }
        audit.record(AuditEntry.byStaff(
                "account.staff.created",
                "staff_account",
                loginName,
                operatorId,
                null,
                Map.of("role", new FieldChange(null, role))));
        log.info("[STAFF] 员工已创建, loginName={}, role={}, operator={}", mask(loginName), role, operatorId);
    }

    /**
     * 调整岗位。三道闸门：不能改自己（调低自己的岗位等于当场自削权限且事后无痕）；
     * 末位超管不可降级（降掉最后一个在岗超管，平台就再没有人能建员工/调岗位/封店）；
     * 同岗位是空动作（账本里一行「没发生过的变更」是噪音）。
     */
    @Transactional
    public void updateRole(UUID staffId, String role, UUID operatorId) {
        StaffMapper.StaffRow staff = requireStaff(staffId);
        if (staffId.equals(operatorId)) {
            throw BusinessException.badRequest("不能修改自己的岗位");
        }
        if (role.equals(staff.role())) {
            return;
        }
        if ("SUPER_ADMIN".equals(staff.role()) && staff.active()) {
            requireNotLastActiveSuperAdmin("不能降级最后一个在岗的超管");
        }
        if (!store.updateRole(staffId, role)) {
            throw BusinessException.conflict("员工状态已变化，请刷新后重试");
        }
        audit.record(AuditEntry.byStaff(
                "account.staff.role_changed",
                "staff_account",
                staff.loginName(),
                operatorId,
                null,
                Map.of("role", new FieldChange(staff.role(), role))));
        log.info("[STAFF] 岗位调整, staffId={}, {} -> {}, operator={}", staffId, staff.role(), role, operatorId);
    }

    /**
     * 启用/禁用。禁用同步吊销全端会话：员工 access 在途也立即失效（判权每请求实时查库是第一道，
     * 会话吊销是第二道）。启用即恢复，需重新登录取新会话。
     */
    @Transactional
    public void updateStatus(UUID staffId, String status, UUID operatorId) {
        StaffMapper.StaffRow staff = requireStaff(staffId);
        boolean disabling = EntityStatus.DISABLED.equals(status);
        if (disabling && staff.active() && "SUPER_ADMIN".equals(staff.role())) {
            requireNotLastActiveSuperAdmin("不能禁用最后一个在岗的超管");
        }
        if (!store.updateStatus(staffId, status)) {
            // 0 行 = 已是目标状态（重复下发/并发抢先），不重复吊销会话、不补第二行审计
            throw BusinessException.conflict("员工状态已变化，请刷新后重试");
        }
        if (disabling) {
            refreshTokenStore.revokeAll(staffId.toString());
        }
        audit.record(AuditEntry.byStaff(
                "account.staff.status_changed",
                "staff_account",
                staff.loginName(),
                operatorId,
                null,
                Map.of("status", new FieldChange(staff.status(), status))));
        log.info("[STAFF] 状态变更, staffId={}, {} -> {}, operator={}", staffId, staff.status(), status, operatorId);
    }

    /**
     * 末位超管保护（禁用与降级共用）：这个员工是唯一还在岗的超管就 409。
     * 先取串行闸、再数人：这条判的是聚合，行级条件更新挡不住「两个最后超管在同一刻被分别禁用」
     * ——两边的写各不碰对方的行，各自的计数都还看见对方在岗，判完双双放行，平台就此失去治理能力。
     */
    private void requireNotLastActiveSuperAdmin(String detail) {
        store.lockGovernance();
        if (store.countActiveSuperAdmins() <= 1) {
            throw BusinessException.conflict(detail);
        }
    }

    private StaffMapper.StaffRow requireStaff(UUID staffId) {
        return store.findById(staffId).orElseThrow(() -> BusinessException.notFound("员工不存在"));
    }

    private static String mask(String loginName) {
        if (loginName == null || loginName.length() < 4) {
            return "****";
        }
        return loginName.charAt(0) + "***" + loginName.substring(loginName.length() - 2);
    }
}
