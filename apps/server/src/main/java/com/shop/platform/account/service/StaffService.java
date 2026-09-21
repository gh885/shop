package com.shop.platform.account.service;

import com.shop.platform.account.mapper.Staff;
import com.shop.platform.account.mapper.StaffMapper;
import com.shop.platform.common.BusinessException;
import com.shop.platform.infra.security.JwtProvider;
import com.shop.platform.infra.security.RefreshTokenStore;
import com.shop.platform.infra.security.TokenPair;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

/** 平台员工认证：工号 + 密码登录，token 与 C 端隔离（kind=staff），凭证轮换复用 RefreshTokenStore。 */
@Service
@Slf4j
@RequiredArgsConstructor
public class StaffService {

    private final StaffMapper staffMapper;
    private final JwtProvider jwtProvider;
    private final PasswordEncoder passwordEncoder;
    private final RefreshTokenStore refreshTokenStore;

    // 登录
    /** 工号 + 密码登录（平台员工独立账号体系，不走手机验证码） */
    public TokenPair login(String employeeNo, String password, String deviceId) {
        // 1. 查员工并比对密码（不存在与密码错误统一提示，不暴露账号存在性）
        Staff staff = staffMapper.selectByEmployeeNo(employeeNo);
        if (staff == null || !passwordEncoder.matches(password, staff.getPasswordHash())) {
            log.warn("[STAFF] 登录失败：工号或密码错误, employeeNo={}", employeeNo);
            throw BusinessException.unauthorized("工号或密码错误");
        }

        // 2. 检查账号状态
        if (!staff.isActive()) {
            throw new BusinessException(403, "STAFF_DISABLED", "账号已被禁用");
        }

        // 3. 签发 Token（kind=staff，与 C 端用户 token 隔离）
        return issueTokens(staff, deviceId);
    }

    // Token 刷新（复用 RefreshTokenStore 轮换机制）
    /** 刷新双 token（一次一换 + 重放检测，与 C 端同一套凭证逻辑） */
    public TokenPair refresh(String refreshToken, String deviceId) {
        // 1~4. 消费旧码 + 重放裁决 + 标记消费 + 清旧设备索引
        String storedStaffId = refreshTokenStore.rotate(refreshToken, deviceId, "[STAFF]");

        // 5. 查员工并签发全新 Token；禁用员工在此拦截——旧码已消费、新码不签发，封号即等于吊销全部会话
        Staff staff = staffMapper.selectById(UUID.fromString(storedStaffId));
        if (staff == null) throw BusinessException.notFound("员工不存在");
        if (!staff.isActive()) {
            throw new BusinessException(403, "STAFF_DISABLED", "账号已被禁用");
        }
        return issueTokens(staff, deviceId);
    }

    // 登出 / 当前员工
    /** 登出：删除当前设备 refresh token */
    public void logout(UUID staffId, String deviceId) {
        refreshTokenStore.revokeDevice(staffId.toString(), deviceId);
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
