package com.shop.platform.account.service;

import com.shop.platform.account.mapper.BuyerMapper;
import com.shop.platform.common.BusinessException;
import com.shop.platform.common.ErrorCodes;
import com.shop.platform.infra.security.AccessTokenIssuer;
import com.shop.platform.infra.security.CurrentOperator;
import com.shop.platform.infra.security.DeviceInfo;
import com.shop.platform.infra.security.RefreshTokenStore;
import com.shop.platform.infra.security.UserAgentParser;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * 买家会话：刷新、登出、设备管理。
 *
 * <p>刷新先消费旧码（轮换 + 重放裁决在 {@link RefreshTokenStore}），再回库确认账号还能用
 * ——禁用/注销在此拦截：旧码已消费、新码不签发，封号即等于吊销全部会话（access 最多活到自然过期）。
 */
@Component
public class BuyerSessionService {

    private static final Logger log = LoggerFactory.getLogger(BuyerSessionService.class);

    private final BuyerMapper buyers;
    private final AccessTokenIssuer tokenIssuer;
    private final RefreshTokenStore refreshTokenStore;
    private final UserAgentParser userAgentParser;

    public BuyerSessionService(
            BuyerMapper buyers,
            AccessTokenIssuer tokenIssuer,
            RefreshTokenStore refreshTokenStore,
            UserAgentParser userAgentParser) {
        this.buyers = Objects.requireNonNull(buyers, "buyers");
        this.tokenIssuer = Objects.requireNonNull(tokenIssuer, "tokenIssuer");
        this.refreshTokenStore = Objects.requireNonNull(refreshTokenStore, "refreshTokenStore");
        this.userAgentParser = Objects.requireNonNull(userAgentParser, "userAgentParser");
    }

    /**
     * 刷新双 token（一次一换；超期重放判盗用 → 全端吊销 → 410）。设备身份以 token 绑定为准
     * （见 RefreshTokenStore.rotate），新码沿用同一台设备。
     */
    public BuyerAuthService.Session refresh(String refreshToken, String deviceId, String clientIp, String userAgent) {
        RefreshTokenStore.Rotation rotated = refreshTokenStore.rotate(refreshToken, deviceId, "[BUYER]");
        UUID buyerId = UUID.fromString(rotated.subjectId());

        BuyerMapper.BuyerRow user = buyers.find(buyerId).orElse(null);
        if (user == null || user.deletedAt() != null) {
            // 注销流程刚生效：旧码已消费、新码不签发，会话就地死亡
            throw BusinessException.unauthorized(ErrorCodes.INVALID_TOKEN, "登录状态已失效");
        }
        if (!"active".equals(user.status())) {
            throw BusinessException.forbidden(ErrorCodes.USER_DISABLED, "账号已被禁用");
        }
        return issue(buyerId, rotated.deviceId(), clientIp, userAgent);
    }

    /** 登出当前设备 */
    public void logout(UUID buyerId, String deviceId) {
        refreshTokenStore.revokeDevice(buyerId.toString(), deviceId);
    }

    /** 登出所有设备（清空全端会话，当前请求的 access 也会在自然过期后失效） */
    public void logoutAll(UUID buyerId) {
        refreshTokenStore.revokeAll(buyerId.toString());
    }

    /** 枚举当前有效会话（设备名/IP/时间），供安全设置页展示。哪台是本机由前端拿自己的 deviceId 比。 */
    public List<RefreshTokenStore.DeviceEntry> devices(UUID buyerId) {
        return refreshTokenStore.listDevices(buyerId.toString());
    }

    /** 登出单台设备 */
    public void deleteDevice(UUID buyerId, String deviceId) {
        refreshTokenStore.revokeDevice(buyerId.toString(), deviceId);
    }

    private BuyerAuthService.Session issue(UUID buyerId, String deviceId, String clientIp, String userAgent) {
        String accessToken = tokenIssuer.issue(buyerId, CurrentOperator.TYPE_BUYER);
        String refreshToken = RefreshTokenStore.newToken();
        DeviceInfo deviceInfo = new DeviceInfo(userAgentParser.parse(userAgent), clientIp, OffsetDateTime.now());
        refreshTokenStore.issue(buyerId.toString(), deviceId, refreshToken, deviceInfo);
        buyers.touchLastLogin(buyerId, OffsetDateTime.now());
        log.info("[BUYER] 会话续期, buyerId={}", buyerId);
        return new BuyerAuthService.Session(accessToken, refreshToken, tokenIssuer.expiresInSeconds());
    }
}
