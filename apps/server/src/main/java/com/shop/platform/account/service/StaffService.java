package com.shop.platform.account.service;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.shop.platform.account.api.StaffReadQuery;
import com.shop.platform.account.dto.AdminStaffQuery;
import com.shop.platform.account.infra.RateLimiter;
import com.shop.platform.account.mapper.Staff;
import com.shop.platform.account.mapper.StaffMapper;
import com.shop.platform.account.model.StaffRole;
import com.shop.platform.account.model.StaffStatus;
import com.shop.platform.audit.api.AuditAction;
import com.shop.platform.audit.api.RecordAuditCommand;
import com.shop.platform.common.BusinessException;
import com.shop.platform.common.ErrorCodes;
import com.shop.platform.common.PageParams;
import com.shop.platform.common.PageResult;
import com.shop.platform.common.Text;
import com.shop.platform.common.Validate;
import com.shop.platform.infra.observability.BizEvent;
import com.shop.platform.infra.security.JwtProvider;
import com.shop.platform.infra.security.RefreshTokenStore;
import com.shop.platform.infra.security.TokenPair;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 平台员工认证：工号 + 密码登录，token 与 C 端隔离（kind=staff），凭证轮换复用 RefreshTokenStore。 */
@Service
@RequiredArgsConstructor
public class StaffService {

    /** 员工口令爆破限流（与买家侧 LOGIN-05 同档位，独立键空间） */
    private static final String RATE_IP_STAFF_PWD = "rl:ip:staff-pwd:";

    private static final String RATE_STAFF_PWD = "rl:staff:pwd:";
    private static final int RATE_IP_MAX = 10;
    private static final int RATE_IP_WINDOW = 60; // 秒
    private static final int RATE_STAFF_MAX = 5;
    private static final int RATE_STAFF_WINDOW = 600; // 秒

    private final StaffMapper staffMapper;
    private final JwtProvider jwtProvider;
    private final PasswordEncoder passwordEncoder;
    private final RefreshTokenStore refreshTokenStore;
    private final StringRedisTemplate redis;
    private final RecordAuditCommand recordAuditCommand;
    private final StaffReadQuery staffReadQuery;

    // 登录
    /**
     * 工号 + 密码登录（平台员工独立账号体系，不走手机验证码）。
     *
     * <p>限流与等时对比两道防护与买家侧密码登录同一套口径（LOGIN-05 / LOGIN-01）：本端点匿名可达，
     * 打的又是权限最高的账号库，缺任一道它就是爆破性价比最高的入口——缺限流可按线速试口令，
     * 缺等时对比则「工号存在」与「不存在」的响应耗时差一次 BCrypt，等于白送一个枚举口。
     */
    public TokenPair login(String employeeNo, String password, String deviceId, String clientIp) {
        // 1. 限流检查（被限流时走 dummy hash 保持时序一致）
        rejectIfRateLimited(employeeNo, password, clientIp);

        // 2. 验证凭证：查员工与比密码之间不做分支，工号不存在也用占位哈希跑满 KDF（LOGIN-01）
        Staff staff = staffMapper.selectByEmployeeNo(employeeNo);
        String storedHash = staff != null ? staff.getPasswordHash() : AuthService.DUMMY_PASSWORD_HASH;
        // 必须先算进变量再判：写成 staff == null || !matches(...) 会短路掉 KDF，等时防护形同虚设
        boolean matched = passwordEncoder.matches(password, storedHash);
        if (staff == null || !matched) {
            throw loginRejected(staff, employeeNo, clientIp);
        }

        // 3. 检查账号状态
        if (!staff.isActive()) {
            // 被禁员工还在试工号口令，本身就是最该留下记录的一次失败登录（reason=disabled）
            BizEvent.of("staff.login.failed")
                    .put("reason", "disabled")
                    .put("client_ip", clientIp)
                    .put("staff_id", staff.getId())
                    .warn();
            throw BusinessException.forbidden(ErrorCodes.STAFF_DISABLED, "账号已被禁用");
        }

        // 4. 登录成功清除失败计数（LOGIN-08）
        clearPasswordRateLimit(employeeNo, clientIp);

        // 5. 签发 Token（kind=staff，与 C 端用户 token 隔离）
        TokenPair tokens = issueTokens(staff, deviceId);
        BizEvent.of("staff.login.succeeded").put("staff_id", staff.getId()).emit();
        return tokens;
    }

    /** 双维度限流（IP + 工号），被限流时仍跑一次 BCrypt，防按返回时长探测是否已被限 */
    private void rejectIfRateLimited(String employeeNo, String password, String ip) {
        boolean ipLimited =
                RateLimiter.exceeded(redis, RATE_IP_STAFF_PWD + ip, RATE_IP_MAX, Duration.ofSeconds(RATE_IP_WINDOW));
        boolean staffLimited = RateLimiter.exceeded(
                redis, RATE_STAFF_PWD + employeeNo, RATE_STAFF_MAX, Duration.ofSeconds(RATE_STAFF_WINDOW));

        if (ipLimited || staffLimited) {
            passwordEncoder.matches(password, AuthService.DUMMY_PASSWORD_HASH);
            BizEvent.of("staff.login.failed")
                    .put("reason", "rate_limited")
                    .put("client_ip", ip)
                    .put("employee_no", maskEmployeeNo(employeeNo))
                    .warn();
            throw BusinessException.unauthorized("工号或密码错误");
        }
    }

    private void clearPasswordRateLimit(String employeeNo, String ip) {
        redis.delete(RATE_IP_STAFF_PWD + ip);
        redis.delete(RATE_STAFF_PWD + employeeNo);
    }

    /**
     * 登录失败的统一出口：对外同一句话（防工号枚举），精确原因只进事件。工号是半标识符，
     * 明文不整串落字段（未命中那支才带掩码工号——没有 staff_id 可指）。口径同
     * {@code AuthService.loginRejected}。
     */
    private BusinessException loginRejected(Staff staff, String employeeNo, String clientIp) {
        BizEvent.of("staff.login.failed")
                .put("reason", staff == null ? "staff_not_found" : "wrong_password")
                .put("client_ip", clientIp)
                .put("staff_id", staff == null ? null : staff.getId())
                .put("employee_no", staff == null ? maskEmployeeNo(employeeNo) : null)
                .warn();
        return BusinessException.unauthorized("工号或密码错误");
    }

    private static String maskEmployeeNo(String employeeNo) {
        if (employeeNo == null || employeeNo.length() < 4) {
            return "****";
        }
        return employeeNo.charAt(0) + "***" + employeeNo.substring(employeeNo.length() - 2);
    }

    // Token 刷新（复用 RefreshTokenStore 轮换机制）
    /** 刷新双 token（一次一换 + 重放检测，与 C 端同一套凭证逻辑） */
    public TokenPair refresh(String refreshToken, String deviceId) {
        // 1~4. 消费旧码 + 重放裁决 + 标记消费 + 清旧设备索引；设备身份以 token 绑定为准（见 rotate）
        RefreshTokenStore.Rotation rotated = refreshTokenStore.rotate(refreshToken, deviceId, "[STAFF]");

        // 5. 查员工并签发全新 Token；禁用员工在此拦截——旧码已消费、新码不签发，封号即等于吊销全部会话
        Staff staff = staffMapper.selectById(UUID.fromString(rotated.subjectId()));
        if (staff == null) throw BusinessException.notFound("员工不存在");
        if (!staff.isActive()) {
            throw BusinessException.forbidden(ErrorCodes.STAFF_DISABLED, "账号已被禁用");
        }
        return issueTokens(staff, rotated.deviceId());
    }

    // 登出 / 当前员工
    /** 登出：删除当前设备 refresh token */
    public void logout(UUID staffId, String deviceId) {
        refreshTokenStore.revokeDevice(staffId.toString(), deviceId);
    }

    /** 管理端员工列表：支持岗位账号按工号/姓名检索，手机号等敏感凭证不进入出参。 */
    @Transactional(readOnly = true)
    public PageResult<AdminStaffItem> pageAdminStaff(PageParams pageParams, AdminStaffQuery query) {
        // 1. 状态筛选与买家列表保持同一错误口径；未知岗位在出参时按空值展示，不把库内脏值升级成 500。
        StaffStatus status = Validate.enumFilter(StaffStatus.class, query.status(), "非法的员工状态筛选值");
        String keyword = Text.blankToNull(query.keyword());

        // 2. 取数：关键字命中工号还是展示名、按什么排，是员工列表的口径，收在 mapper（见 selectPageAdmin 注释）。
        Page<Staff> rows = staffMapper.selectPageAdmin(pageParams, status, keyword);

        // 3. 岗位在 service 边界解析，HTTP 出参只带稳定的枚举名/空值。
        return new PageResult<>(
                rows.getRecords().stream()
                        .map(staff -> {
                            StaffRole role = StaffRole.parseOrNull(staff.getRole());
                            return new AdminStaffItem(
                                    staff.getId(),
                                    staff.getEmployeeNo(),
                                    staff.getDisplayName(),
                                    staff.getStatus(),
                                    role == null ? null : role.name(),
                                    staff.getCreatedAt());
                        })
                        .toList(),
                rows.getTotal());
    }

    // 管理端封号（PATCH /admin/staff/{id}/status）
    /**
     * 设置员工状态（禁用/启用）。禁用比买家侧多一步「吊销全端会话」：员工 access token 寿命 8 小时
     * （ACC-19），只靠登录/刷新闸门（STAFF_DISABLED）收场太慢，禁用即清光 Redis 里全部 refresh，
     * 8 小时内在途 access 也被吊销（刷新必然失败）；权限层 effectivePermissions 实时查库，
     * 禁用当个请求起判权即空集，双保险。启用即恢复（status 回 ACTIVE，需重新登录取新会话）。
     *
     * <p>审计账本（audit :: api）同事务写入，detail 里的工号只落掩码形状。
     */
    @Transactional
    public void updateStaffStatus(UUID staffId, StaffStatus status, UUID operatorId) {
        // 1. 校验员工存在
        Staff staff = staffMapper.selectById(staffId);
        if (staff == null) throw BusinessException.notFound("员工不存在");

        // 1.5 末位超管保护（ACC-57）：禁用最后一个在岗超管会让平台永久失去「建员工/调岗位/封店」的能力
        //     （STAFF_MANAGE 只挂通配，而通配本身挂在超管岗位上）。这道在写入前判，与降级那条同一口径。
        if (!status.isActive()) {
            requireNotLastActiveSuperAdmin(staff, "不能禁用最后一个在岗的超管");
        }

        // 2. 落状态：一句条件更新。并发下的后到者影响 0 行 → 409，于是既不重复吊销会话、
        //    也不往账本里补第二行同样的处置（口径同 updateStaffRole）
        OffsetDateTime now = OffsetDateTime.now();
        int changed = status.isActive() ? staffMapper.enable(staffId, now) : staffMapper.disable(staffId, now);
        Validate.conflict(changed == 1, "员工状态已变化，请刷新后重试");

        // 3. 禁用同步吊销全端 refresh token（封号即时生效，不等 8 小时 access 自然过期）
        if (!status.isActive()) {
            refreshTokenStore.revokeAll(staffId.toString());
        }
        // operator_id 是被禁员工之外的另一个 staff_id，两者不能共用一个键名（口径同 shop_member.phone_revealed）
        BizEvent.of("staff.status.changed")
                .put("staff_id", staffId)
                .put("status", status)
                .put("operator_id", operatorId)
                .emit();
        // 审计账本（同一事务）：禁用/启用员工属治理动作
        recordAuditCommand.record(
                AuditAction.ACCOUNT_STAFF_STATUS_CHANGED,
                staffId,
                operatorId,
                staffReadQuery.displayNameById(operatorId),
                "status=%s, employee_no=%s".formatted(status, maskEmployeeNo(staff.getEmployeeNo())));
    }

    // 管理端创建员工与调岗位（POST /admin/staff、PUT /admin/staff/{id}/role）
    /**
     * 创建平台员工（ACC-57）：工号 + 初始口令 + 岗位。
     *
     * <p>两条闸门：① 工号唯一（预检 + 唯一索引双保险，撞车给 400 而不是 500）；
     * ② 口令强度走 {@link PasswordPolicy}——与买家侧同一份口径（多字节口令被 BCrypt 静默截断是真实事故）。
     * 岗位是入参而非默认：创建时就想清楚「这个人要干什么」，比事后调岗安全（调岗有自指与末位两道禁令）。
     */
    @Transactional
    public void createStaff(String employeeNo, String password, String displayName, StaffRole role, UUID operatorId) {
        // 1. 工号唯一（预检只挡误操作，并发由 uk_staff_employee_no 兜底）
        if (staffMapper.existsByEmployeeNo(employeeNo)) {
            throw BusinessException.badRequest("工号已被使用，请换一个");
        }

        // 2. 口令强度：与买家建密同一份判定（REG-01/03/06），无手机号对照物故传 null
        PasswordPolicy.require(password, null);

        // 3. 建行（ACTIVE 默认）——口令只落 BCrypt 哈希
        Staff created = Staff.builder()
                .employeeNo(employeeNo)
                .passwordHash(passwordEncoder.encode(password))
                .displayName(Text.blankToNull(displayName))
                .status(StaffStatus.ACTIVE)
                .role(role.name())
                .build();
        try {
            staffMapper.insert(created);
        } catch (DuplicateKeyException e) {
            // 并发下两人同取一号：唯一索引是真相，给与预检一致的 400
            // （PG 一报唯一错就把事务标 aborted，靠 catch 后回读是走不到的，25P02）
            throw BusinessException.badRequest("工号已被使用，请换一个");
        }

        // 4. 审计账本（同一事务）：谁建的这个号、开到什么岗位
        recordAuditCommand.record(
                AuditAction.ACCOUNT_STAFF_CREATED,
                created.getId(),
                operatorId,
                staffReadQuery.displayNameById(operatorId),
                "employee_no=%s, role=%s".formatted(maskEmployeeNo(employeeNo), role));
    }

    /**
     * 调整员工岗位（ACC-57）。三道闸门，缺一条就会把平台治理能力玩坏：
     * <ol>
     *   <li><b>不能改自己</b>：调低自己的岗位等于当场自削权限（且事后无痕），把「误操作」变成「既成事实」。</li>
     *   <li><b>末位超管不可降级</b>：降掉最后一个在岗超管，平台就再没有人能建员工/调岗位/封店（STAFF_MANAGE 只挂通配）。</li>
     *   <li><b>同岗位是空动作</b>：直接原样返回，不写 updated_at，也不记审计——账本里一行「没发生过的变更」是噪音。</li>
     * </ol>
     */
    @Transactional
    public void updateStaffRole(UUID staffId, StaffRole role, UUID operatorId) {
        // 1. 存在性 + 自指禁令
        Staff staff = staffMapper.selectById(staffId);
        if (staff == null) throw BusinessException.notFound("员工不存在");
        Validate.isTrue(!staffId.equals(operatorId), "不能修改自己的岗位");

        // 2. 同岗位是空动作
        StaffRole current = StaffRole.parseOrNull(staff.getRole());
        if (current == role) return;

        // 3. 末位超管保护：降级前判，只数在岗超管（被禁的不算，它已没有治理能力）
        if (current == StaffRole.SUPER_ADMIN) {
            requireNotLastActiveSuperAdmin(staff, "不能降级最后一个在岗的超管");
        }

        // 4. 落岗位：0 行即并发下已被别人改掉
        Validate.conflict(staffMapper.updateRole(staffId, role.name()) == 1, "员工状态已变化，请刷新后重试");

        // 5. 审计账本（同一事务）
        recordAuditCommand.record(
                AuditAction.ACCOUNT_STAFF_ROLE_CHANGED,
                staffId,
                operatorId,
                staffReadQuery.displayNameById(operatorId),
                "from=%s, to=%s, employee_no=%s".formatted(current, role, maskEmployeeNo(staff.getEmployeeNo())));
    }

    /**
     * 末位超管保护（禁用与降级共用这一道）：这个员工是唯一还在岗的超管就 409，被禁用的超管不算在岗。
     *
     * <p><b>先取串行闸、再数人</b>：这条判的是聚合，行级条件更新挡不住「两个最后超管在同一刻被分别禁用」
     * ——两边的写各不碰对方的行，各自的计数都还看见对方在岗，判完双双放行，平台就此失去治理能力。
     * 判据收在这一个私有方法里，是为了不给「新调用点只写了计数没写锁」留口子。
     *
     * <p>非超管直接返回，不进锁：普通员工的治理动作没有聚合约束，不该被这把锁串起来。
     */
    private void requireNotLastActiveSuperAdmin(Staff staff, String detail) {
        if (!StaffRole.SUPER_ADMIN.name().equals(staff.getRole()) || !staff.isActive()) {
            return;
        }
        staffMapper.lockSuperAdminGovernance();
        Validate.conflict(staffMapper.countActiveSuperAdmins() > 1, detail);
    }

    /** 当前登录员工信息（含岗位与有效权限码，前端菜单/按钮显隐用） */
    public StaffInfo getMe(UUID staffId) {
        Staff staff = staffMapper.selectById(staffId);
        if (staff == null) throw BusinessException.notFound("员工不存在");

        // 1. 解析岗位；禁用/未知岗位按无权限展示（登录/判权层会拦，这里只负责如实呈现）
        boolean active = staff.isActive();
        StaffRole role = StaffRole.parseOrNull(staff.getRole());

        // 2. SUPER_ADMIN 展开通配符为具体码列表；无岗位或已禁用给空集
        List<String> permissions = active && role != null ? role.declaredPermissions() : List.of();
        return new StaffInfo(
                staff.getId(),
                staff.getEmployeeNo(),
                staff.getDisplayName(),
                role == null ? null : role.name(),
                permissions);
    }

    /** 当前员工有效权限集（PermissionInterceptor 判权入口，每请求实时查库）。
     *  禁用/查无此人/未知岗位 → 空集：token 还活着但权限立即消失，收权下一请求生效。 */
    public Set<String> effectivePermissions(UUID staffId) {
        Staff staff = staffMapper.selectById(staffId);
        if (staff == null || !staff.isActive()) {
            return Set.of();
        }
        StaffRole role = StaffRole.parseOrNull(staff.getRole());
        if (role == null) {
            return Set.of();
        }
        return role.permissions();
    }

    // Token 签发
    private TokenPair issueTokens(Staff staff, String deviceId) {
        String accessToken = jwtProvider.createStaffAccessToken(staff.getId());
        String refreshToken = jwtProvider.generateRefreshToken();

        // 只存 HMAC 摘要不落明文
        refreshTokenStore.issue(staff.getId().toString(), deviceId, refreshToken);
        return new TokenPair(accessToken, refreshToken);
    }
}
