package com.shop.platform.admin.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.shop.platform.admin.mapper.Staff;
import com.shop.platform.admin.mapper.StaffMapper;
import com.shop.platform.common.BusinessException;
import com.shop.platform.infra.security.JwtProvider;
import com.shop.platform.infra.security.RefreshTokenStore;
import com.shop.platform.infra.security.TokenPair;
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

    // ========== 登录 ==========

    /** 工号 + 密码登录（平台员工独立账号体系，不走手机验证码） */
    public TokenPair login(String employeeNo, String password, String deviceId) {
        // 1. 查员工并比对密码（不存在与密码错误统一提示，不暴露账号存在性）
        Staff staff = staffMapper.selectOne(new LambdaQueryWrapper<Staff>().eq(Staff::getEmployeeNo, employeeNo));
        if (staff == null || !passwordEncoder.matches(password, staff.getPasswordHash())) {
            log.warn("[ADMIN] 登录失败：工号或密码错误, employeeNo={}", employeeNo);
            throw BusinessException.unauthorized("工号或密码错误");
        }

        // 2. 检查账号状态
        if (!Staff.STATUS_ACTIVE.equals(staff.getStatus())) {
            throw new BusinessException(403, "STAFF_DISABLED", "账号已被禁用");
        }

        // 3. 签发 Token（kind=staff，与 C 端用户 token 隔离）
        return issueTokens(staff, deviceId);
    }

    // ========== Token 刷新（复用 RefreshTokenStore 轮换机制） ==========

    /** 刷新双 token（一次一换 + 重放检测，与 C 端同一套凭证逻辑） */
    public TokenPair refresh(String refreshToken, String deviceId) {
        String hash = RefreshTokenStore.sha256Hex(refreshToken);

        // 1. 消费旧 Refresh Token（getAndDelete = 一次性）
        String storedStaffId = refreshTokenStore.consume(hash);

        if (storedStaffId == null) {
            // 2. 重放检测：检查是否已被消费
            String replayedStaffId = refreshTokenStore.consumedSubject(hash);
            if (replayedStaffId != null) {
                log.warn("[ADMIN] Refresh Token 重放攻击已检测, staffId={}", replayedStaffId);
                refreshTokenStore.revokeAll(replayedStaffId);
                throw new BusinessException(410, "REFRESH_TOKEN_REUSED", "Refresh Token 已被重复使用，所有设备已下线");
            }
            throw BusinessException.unauthorized("Refresh Token 无效或已过期");
        }

        UUID staffId = UUID.fromString(storedStaffId);

        // 3. 标记已消费 + 清除旧设备索引
        refreshTokenStore.markConsumed(hash, storedStaffId);
        refreshTokenStore.revokeDevice(storedStaffId, deviceId);

        // 4. 查员工并签发全新 Token
        Staff staff = staffMapper.selectById(staffId);
        if (staff == null) throw BusinessException.notFound("员工不存在");
        return issueTokens(staff, deviceId);
    }

    // ========== 登出 / 当前员工 ==========

    /** 登出：删除当前设备 refresh token */
    public void logout(UUID staffId, String deviceId) {
        refreshTokenStore.revokeDevice(staffId.toString(), deviceId);
    }

    /** 当前登录员工信息 */
    public StaffInfo getMe(UUID staffId) {
        Staff staff = staffMapper.selectById(staffId);
        if (staff == null) throw BusinessException.notFound("员工不存在");
        return new StaffInfo(staff.getId(), staff.getEmployeeNo(), staff.getDisplayName());
    }

    // ========== Token 签发 ==========

    private TokenPair issueTokens(Staff staff, String deviceId) {
        String accessToken = jwtProvider.createStaffAccessToken(staff.getId());
        String refreshToken = jwtProvider.generateRefreshToken();
        String hash = RefreshTokenStore.sha256Hex(refreshToken);

        // 存 SHA-256 哈希，不落明文；签发 + 设备索引见 RefreshTokenStore
        refreshTokenStore.issue(staff.getId().toString(), deviceId, hash);
        return new TokenPair(accessToken, refreshToken);
    }
}
