package com.shop.platform.auth;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.shop.platform.auth.infra.SmsChannel;
import com.shop.platform.auth.mapper.User;
import com.shop.platform.auth.mapper.UserMapper;
import com.shop.platform.auth.service.AuthService;
import com.shop.platform.auth.service.SmsCodeService;
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
            user.setStatus("ACTIVE");

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
            user.setStatus("ACTIVE");

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
            user.setStatus("DISABLED");

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

            when(refreshTokenStore.consume(token)).thenReturn(USER_ID.toString());
            when(userMapper.selectById(USER_ID)).thenReturn(new User() {
                {
                    setId(USER_ID);
                    setStatus("ACTIVE");
                }
            });
            when(jwtProvider.createAccessToken(USER_ID)).thenReturn("new-at");
            when(jwtProvider.generateRefreshToken()).thenReturn("rt:new");

            var result = authService.refresh(token, "dev1", "127.0.0.1", "UA");
            assertEquals("new-at", result.accessToken());
            assertEquals("rt:new", result.refreshToken());
        }

        @Test
        void 令牌过期_拒绝() {
            String token = "rt:expired";

            when(refreshTokenStore.consume(token)).thenReturn(null);
            when(refreshTokenStore.checkReplay(token))
                    .thenReturn(new RefreshTokenStore.ReplayCheck(false, false, null));

            assertThrows(BusinessException.class, () -> authService.refresh(token, "dev1", "127.0.0.1", "UA"));
        }

        @Test
        void 重放检测_410() {
            String token = "rt:replay";

            when(refreshTokenStore.consume(token)).thenReturn(null);
            when(refreshTokenStore.checkReplay(token))
                    .thenReturn(new RefreshTokenStore.ReplayCheck(true, false, USER_ID.toString()));

            var ex = assertThrows(BusinessException.class, () -> authService.refresh(token, "dev1", "127.0.0.1", "UA"));
            assertEquals(410, ex.getHttpStatus());
        }
    }
}
