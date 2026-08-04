package com.shop.platform.auth.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.shop.platform.auth.infra.SmsChannel;
import com.shop.platform.auth.mapper.User;
import com.shop.platform.auth.mapper.UserMapper;
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
        void rejectNull() {
            var ex = assertThrows(BusinessException.class, () -> authService.setPassword(USER_ID, null, null));
            assertEquals(400, ex.getHttpStatus());
        }

        @Test
        void rejectShortPassword() {
            var ex = assertThrows(BusinessException.class, () -> authService.setPassword(USER_ID, null, "1234567"));
            assertEquals(400, ex.getHttpStatus());
            assertNull(ex.getCode());
        }

        @Test
        void rejectLongPassword() {
            var ex =
                    assertThrows(BusinessException.class, () -> authService.setPassword(USER_ID, null, "a".repeat(73)));
            assertEquals(400, ex.getHttpStatus());
            assertNull(ex.getCode());
        }

        @Test
        void rejectCommonPassword() {
            var ex = assertThrows(BusinessException.class, () -> authService.setPassword(USER_ID, null, "password"));
            assertEquals(400, ex.getHttpStatus());
            assertNull(ex.getCode());
        }

        @Test
        void rejectPhoneEqualsPassword() {
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
        void success() {
            var user = new User();
            user.setId(USER_ID);
            user.setPhone("13800138000");
            user.setPasswordHash("$2a$12$hashhashhashhashhashhashah");
            user.setStatus("ACTIVE");

            when(userMapper.selectOne(any())).thenReturn(user);
            when(passwordEncoder.matches(eq("correct"), anyString())).thenReturn(true);
            when(jwtProvider.createAccessToken(USER_ID)).thenReturn("at");
            when(jwtProvider.generateRefreshToken()).thenReturn("rt:xxx");

            var result = authService.loginByPassword("13800138000", "correct", "dev1", "127.0.0.1");

            assertEquals("at", result.accessToken());
            assertEquals("rt:xxx", result.refreshToken());
            verify(redis, times(2)).delete(anyString()); // clear rate limit
        }

        @Test
        void wrongPassword() {
            var user = new User();
            user.setId(USER_ID);
            user.setPhone("13800138000");
            user.setPasswordHash("$2a$12$hashhashhashhashhashhashah");
            user.setStatus("ACTIVE");

            when(userMapper.selectOne(any())).thenReturn(user);
            when(passwordEncoder.matches(eq("wrong"), anyString())).thenReturn(false);

            assertThrows(
                    BusinessException.class,
                    () -> authService.loginByPassword("13800138000", "wrong", "dev1", "127.0.0.1"));
        }

        @Test
        void userNotFound() {
            when(userMapper.selectOne(any())).thenReturn(null);
            // 无论 user 是否存在都用 dummy hash，所以 encoder 不会接触 null
            when(passwordEncoder.matches(anyString(), anyString())).thenReturn(false);

            assertThrows(
                    BusinessException.class,
                    () -> authService.loginByPassword("13800138000", "pwd", "dev1", "127.0.0.1"));
        }

        @Test
        void disabledUser() {
            var user = new User();
            user.setId(USER_ID);
            user.setPasswordHash("$2a$12$hash");
            user.setStatus("DISABLED");

            when(userMapper.selectOne(any())).thenReturn(user);
            when(passwordEncoder.matches(anyString(), anyString())).thenReturn(true);

            var ex = assertThrows(
                    BusinessException.class,
                    () -> authService.loginByPassword("13800138000", "pwd", "dev1", "127.0.0.1"));
            assertEquals(403, ex.getHttpStatus());
        }
    }

    @Nested
    class SetPassword {
        @Test
        void firstTime_noCurrentPasswordRequired() {
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
        void changePassword_requiresCurrentPassword() {
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
        void changePassword_wrongCurrentPassword() {
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
        void success() {
            String token = "rt:valid";
            String hash = AuthHashes.sha256Hex(token);

            when(refreshTokenStore.consume(hash)).thenReturn(USER_ID.toString());
            when(userMapper.selectById(USER_ID)).thenReturn(new User() {
                {
                    setId(USER_ID);
                    setStatus("ACTIVE");
                }
            });
            when(jwtProvider.createAccessToken(USER_ID)).thenReturn("new-at");
            when(jwtProvider.generateRefreshToken()).thenReturn("rt:new");

            var result = authService.refresh(token, "dev1");
            assertEquals("new-at", result.accessToken());
            assertEquals("rt:new", result.refreshToken());
        }

        @Test
        void expiredTokenThrows() {
            String token = "rt:expired";
            String hash = AuthHashes.sha256Hex(token);

            when(refreshTokenStore.consume(hash)).thenReturn(null);
            when(refreshTokenStore.consumedSubject(hash)).thenReturn(null);

            assertThrows(BusinessException.class, () -> authService.refresh(token, "dev1"));
        }

        @Test
        void replayDetectionRevokesAll() {
            String token = "rt:replay";
            String hash = AuthHashes.sha256Hex(token);

            when(refreshTokenStore.consume(hash)).thenReturn(null);
            when(refreshTokenStore.consumedSubject(hash)).thenReturn(USER_ID.toString());

            var ex = assertThrows(BusinessException.class, () -> authService.refresh(token, "dev1"));
            assertEquals(410, ex.getHttpStatus());
        }
    }

    @Test
    void maskPhone() {
        // 通过 loginByPassword 的日志间接测试 maskPhone 行为——确保不抛
        when(userMapper.selectOne(any())).thenReturn(null);
        when(passwordEncoder.matches(anyString(), anyString())).thenReturn(false);

        assertThrows(
                BusinessException.class, () -> authService.loginByPassword("13800138000", "pwd", "dev1", "127.0.0.1"));
    }
}
