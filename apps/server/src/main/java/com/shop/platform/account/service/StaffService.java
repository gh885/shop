package com.shop.platform.account.service;

import com.shop.platform.account.infra.RateLimiter;
import com.shop.platform.account.mapper.Staff;
import com.shop.platform.account.mapper.StaffMapper;
import com.shop.platform.account.model.StaffStatus;
import com.shop.platform.common.BusinessException;
import com.shop.platform.common.ErrorCodes;
import com.shop.platform.infra.observability.BizEvent;
import com.shop.platform.infra.security.JwtProvider;
import com.shop.platform.infra.security.RefreshTokenStore;
import com.shop.platform.infra.security.TokenPair;
import java.time.Duration;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

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

    // 管理端封号（PATCH /admin/staff/{id}/status）
    /**
     * 设置员工状态（禁用/启用）。禁用比买家侧多一步「吊销全端会话」：员工 access token 寿命 8 小时
     * （ACC-19），只靠登录/刷新闸门（STAFF_DISABLED）收场太慢，禁用即清光 Redis 里全部 refresh，
     * 8 小时内在途 access 也被吊销（刷新必然失败）；权限层 effectivePermissions 实时查库，
     * 禁用当个请求起判权即空集，双保险。启用即恢复（status 回 ACTIVE，需重新登录取新会话）。
     */
    public void updateStaffStatus(UUID staffId, StaffStatus status, UUID operatorId) {
        // 1. 校验员工存在
        Staff staff = staffMapper.selectById(staffId);
        if (staff == null) throw BusinessException.notFound("员工不存在");

        // 2. 落状态
        staff.setStatus(status);
        staffMapper.updateById(staff);

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
