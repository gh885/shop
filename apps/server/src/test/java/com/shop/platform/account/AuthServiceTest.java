package com.shop.platform.account;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.shop.platform.account.infra.SmsChannel;
import com.shop.platform.account.mapper.User;
import com.shop.platform.account.mapper.UserMapper;
import com.shop.platform.account.model.UserStatus;
import com.shop.platform.account.service.AuthService;
import com.shop.platform.account.service.SmsCodeService;
import com.shop.platform.common.BusinessException;
import com.shop.platform.infra.security.JwtProvider;
import com.shop.platform.infra.security.RefreshTokenStore;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Captor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;
import org.springframework.security.crypto.password.PasswordEncoder;

@ExtendWith(MockitoExtension.class)
class AuthServiceTest {

    @Mock
    UserMapper userMapper;

    @Mock
    JwtProvider jwtProvider;

    @Mock
    PasswordEncoder passwordEncoder;

    @Mock
    SmsCodeService smsCodeService;

    @Mock
    SmsChannel smsChannel;

    @Mock
    StringRedisTemplate redis;

    @Mock
    ValueOperations<String, String> valueOps;

    @Mock
    RefreshTokenStore refreshTokenStore;

    @InjectMocks
    AuthService authService;

    private static final UUID USER_ID = UUID.randomUUID();

    @Captor
    ArgumentCaptor<User> userCaptor;

    @BeforeEach
    void setUp() {
        lenient().when(redis.opsForValue()).thenReturn(valueOps);
    }

    @Nested
    class PasswordValidation {
        @BeforeEach
        void setUp() {
            var user = new User();
            user.setId(USER_ID);
            user.setPhone("13800138000");
            lenient().when(userMapper.selectById(USER_ID)).thenReturn(user);
        }

        @Test
        void 空密码_拒绝() {
            var ex = assertThrows(BusinessException.class, () -> authService.setPassword(USER_ID, null, null));
            assertEquals(400, ex.getHttpStatus());
        }

        @Test
        void 过短_拒绝() {
            var ex = assertThrows(BusinessException.class, () -> authService.setPassword(USER_ID, null, "1234567"));
            assertEquals(400, ex.getHttpStatus());
            assertNull(ex.getCode());
        }

        @Test
        void 过长_拒绝() {
            var ex =
                    assertThrows(BusinessException.class, () -> authService.setPassword(USER_ID, null, "a".repeat(73)));
            assertEquals(400, ex.getHttpStatus());
            assertNull(ex.getCode());
        }

        @Test
        void 常见弱口令_拒绝() {
            var ex = assertThrows(BusinessException.class, () -> authService.setPassword(USER_ID, null, "password"));
            assertEquals(400, ex.getHttpStatus());
            assertNull(ex.getCode());
        }

        @Test
        void 与手机号相同_拒绝() {
            var user = new User();
            user.setPhone("13800138000");
            when(userMapper.selectById(USER_ID)).thenReturn(user);

            var ex = assertThrows(BusinessException.class, () -> authService.setPassword(USER_ID, null, "13800138000"));
            assertEquals(400, ex.getHttpStatus());
            assertNull(ex.getCode());
        }
    }

    @Nested
    class LoginByPassword {
        @Test
        void 成功_签发双令牌并清限流() {
            var user = new User();
            user.setId(USER_ID);
            user.setPhone("13800138000");
            user.setPasswordHash("$2a$12$hashhashhashhashhashhashah");
            user.setStatus(UserStatus.ACTIVE);

            when(userMapper.selectByPhone("13800138000")).thenReturn(user);
            when(passwordEncoder.matches(eq("correct"), anyString())).thenReturn(true);
            when(jwtProvider.createAccessToken(USER_ID)).thenReturn("at");
            when(jwtProvider.generateRefreshToken()).thenReturn("rt:xxx");

            var result = authService.loginByPassword("13800138000", "correct", "dev1", "127.0.0.1", "UA");

            assertEquals("at", result.accessToken());
            assertEquals("rt:xxx", result.refreshToken());
            verify(redis, times(2)).delete(anyString()); // clear rate limit
        }

        @Test
        void 密码错误_拒绝() {
            var user = new User();
            user.setId(USER_ID);
            user.setPhone("13800138000");
            user.setPasswordHash("$2a$12$hashhashhashhashhashhashah");
            user.setStatus(UserStatus.ACTIVE);

            when(userMapper.selectByPhone("13800138000")).thenReturn(user);
            when(passwordEncoder.matches(eq("wrong"), anyString())).thenReturn(false);

            assertThrows(
                    BusinessException.class,
                    () -> authService.loginByPassword("13800138000", "wrong", "dev1", "127.0.0.1", "UA"));
        }

        @Test
        void 用户不存在_统一话术防枚举() {
            when(userMapper.selectByPhone("13800138000")).thenReturn(null);
            // 无论 user 是否存在都用 dummy hash，所以 encoder 不会接触 null
            when(passwordEncoder.matches(anyString(), anyString())).thenReturn(false);

            assertThrows(
                    BusinessException.class,
                    () -> authService.loginByPassword("13800138000", "pwd", "dev1", "127.0.0.1", "UA"));
        }

        @Test
        void 已禁用_403() {
            var user = new User();
            user.setId(USER_ID);
            user.setPasswordHash("$2a$12$hash");
            user.setStatus(UserStatus.DISABLED);

            when(userMapper.selectByPhone("13800138000")).thenReturn(user);
            when(passwordEncoder.matches(anyString(), anyString())).thenReturn(true);

            var ex = assertThrows(
                    BusinessException.class,
                    () -> authService.loginByPassword("13800138000", "pwd", "dev1", "127.0.0.1", "UA"));
            assertEquals(403, ex.getHttpStatus());
        }
    }

    @Nested
    class SetPassword {
        @Test
        void 首次设置_免旧密码() {
            var user = new User();
            user.setId(USER_ID);
            user.setPhone("13800138000");

            when(userMapper.selectById(USER_ID)).thenReturn(user);
            when(passwordEncoder.encode("newPassword123")).thenReturn("$2a$12$encoded");

            authService.setPassword(USER_ID, null, "newPassword123");

            verify(userMapper).updateById(userCaptor.capture());
            assertEquals("$2a$12$encoded", userCaptor.getValue().getPasswordHash());
        }

        @Test
        void 改密_缺旧密码_401() {
            var user = new User();
            user.setId(USER_ID);
            user.setPasswordHash("$2a$12$oldhash");
            user.setPhone("13800138000");

            when(userMapper.selectById(USER_ID)).thenReturn(user);

            // 不传 currentPassword
            var ex = assertThrows(
                    BusinessException.class, () -> authService.setPassword(USER_ID, null, "newPassword123"));
            assertEquals(401, ex.getHttpStatus());
        }

        @Test
        void 改密_旧密码错_401() {
            var user = new User();
            user.setId(USER_ID);
            user.setPasswordHash("$2a$12$oldhash");
            user.setPhone("13800138000");

            when(userMapper.selectById(USER_ID)).thenReturn(user);
            when(passwordEncoder.matches("wrong", "$2a$12$oldhash")).thenReturn(false);

            var ex = assertThrows(
                    BusinessException.class, () -> authService.setPassword(USER_ID, "wrong", "newPassword123"));
            assertEquals(401, ex.getHttpStatus());
        }
    }

    @Nested
    class TokenRefresh {
        @Test
        void 成功_轮换新令牌() {
            String token = "rt:valid";

            // 这里只验拿到 subjectId 后的签发路径
            when(refreshTokenStore.rotate(token, "dev1", "[AUTH]"))
                    .thenReturn(new RefreshTokenStore.Rotation(USER_ID.toString(), "dev1"));
            when(userMapper.selectById(USER_ID)).thenReturn(new User() {
                {
                    setId(USER_ID);
                    setStatus(UserStatus.ACTIVE);
                }
            });
            when(jwtProvider.createAccessToken(USER_ID)).thenReturn("new-at");
            when(jwtProvider.generateRefreshToken()).thenReturn("rt:new");

            var result = authService.refresh(token, "dev1", "127.0.0.1", "UA");
            assertEquals("new-at", result.accessToken());
            assertEquals("rt:new", result.refreshToken());
        }
    }

    @Nested
    class 管理端封号 { // AuthService.updateUserStatus（PATCH /admin/users/{id}/status）

        @Test
        void 禁用_落DISABLED状态_不同步吊销refresh() {
            User user = new User();
            user.setId(USER_ID);
            user.setStatus(UserStatus.ACTIVE);
            when(userMapper.selectById(USER_ID)).thenReturn(user);

            authService.updateUserStatus(USER_ID, UserStatus.DISABLED);

            verify(userMapper).updateById(userCaptor.capture());
            assertEquals(UserStatus.DISABLED, userCaptor.getValue().getStatus());
            // 封号闭合靠既有闸门链（刷新撞 ensureUserActive + 登录拦 USER_DISABLED），不主动 revokeAll
            verify(refreshTokenStore, never()).revokeAll(anyString());
        }

        @Test
        void 启用_恢复ACTIVE() {
            User user = new User();
            user.setId(USER_ID);
            user.setStatus(UserStatus.DISABLED);
            when(userMapper.selectById(USER_ID)).thenReturn(user);

            authService.updateUserStatus(USER_ID, UserStatus.ACTIVE);

            verify(userMapper).updateById(userCaptor.capture());
            assertEquals(UserStatus.ACTIVE, userCaptor.getValue().getStatus());
        }

        @Test
        void 用户不存在_404() {
            when(userMapper.selectById(USER_ID)).thenReturn(null);

            var ex = assertThrows(
                    BusinessException.class, () -> authService.updateUserStatus(USER_ID, UserStatus.DISABLED));
            assertEquals(404, ex.getHttpStatus());
        }

        @Test
        void 禁用账号_刷新旧码已消费_新码不签发_403() {
            // 封号链路验证：rotate 已消费旧 refresh → 状态闸门抛 403，新令牌不签发
            String token = "rt:consumed";
            when(refreshTokenStore.rotate(token, "dev1", "[AUTH]"))
                    .thenReturn(new RefreshTokenStore.Rotation(USER_ID.toString(), "dev1"));
            User disabled = new User();
            disabled.setId(USER_ID);
            disabled.setStatus(UserStatus.DISABLED);
            when(userMapper.selectById(USER_ID)).thenReturn(disabled);

            var ex = assertThrows(BusinessException.class, () -> authService.refresh(token, "dev1", "127.0.0.1", "UA"));
            assertEquals(403, ex.getHttpStatus());
            assertEquals("USER_DISABLED", ex.getCode());
            verify(jwtProvider, never()).createAccessToken(any());
        }
    }
}
