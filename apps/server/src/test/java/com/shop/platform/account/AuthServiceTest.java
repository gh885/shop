package com.shop.platform.account;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.shop.platform.account.dto.AdminUserQuery;
import com.shop.platform.account.infra.CaptchaService;
import com.shop.platform.account.infra.SmsChannel;
import com.shop.platform.account.mapper.User;
import com.shop.platform.account.mapper.UserMapper;
import com.shop.platform.account.model.UserStatus;
import com.shop.platform.account.service.AuthService;
import com.shop.platform.account.service.SmsCodeService;
import com.shop.platform.common.BusinessException;
import com.shop.platform.common.ErrorCodes;
import com.shop.platform.common.PageParams;
import com.shop.platform.infra.security.JwtProvider;
import com.shop.platform.infra.security.RefreshTokenStore;
import com.shop.platform.testsupport.EventCapture;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Captor;
import org.mockito.InOrder;
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
    CaptchaService captchaService;

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
    private static final UUID OPERATOR_ID = UUID.randomUUID();

    @Captor
    ArgumentCaptor<User> userCaptor;

    @BeforeEach
    void setUp() {
        lenient().when(redis.opsForValue()).thenReturn(valueOps);
    }

    /**
     * 发码防线顺序（ACC-35）：人机验证 → 频控 → OTP。这条顺序原本散在 controller 里，两个匿名发码入口
     * 各说一半；收进 service 后，「谁先谁后」是这里唯一一处断言。
     */
    @Nested
    class 发码 {

        @Test
        void 登录发码_人机验证先于频控与发送() {
            InOrder order = inOrder(captchaService, smsCodeService);

            authService.sendSmsCode("13800138000", "c1", "A1B2", "127.0.0.1");

            order.verify(captchaService).verify("c1", "A1B2");
            order.verify(smsCodeService).sendCode("13800138000", "127.0.0.1");
        }

        @Test
        void 人机验证不过_一条短信都不发() {
            doThrow(BusinessException.badRequest(ErrorCodes.CAPTCHA_INVALID, "图形验证码错误"))
                    .when(captchaService)
                    .verify("c1", "WRONG");

            assertThrows(
                    BusinessException.class, () -> authService.sendSmsCode("13800138000", "c1", "WRONG", "127.0.0.1"));

            verify(smsCodeService, never()).sendCode(anyString(), anyString());
        }

        @Test
        void 找回密码发码_同样先过人机验证() {
            InOrder order = inOrder(captchaService, smsCodeService);

            authService.forgotPassword("13800138000", "c1", "A1B2", "127.0.0.1");

            order.verify(captchaService).verify("c1", "A1B2");
            order.verify(smsCodeService).sendResetCode("13800138000", "127.0.0.1");
        }

        @Test
        void 找回密码_人机验证不过不发重置码() {
            doThrow(BusinessException.badRequest(ErrorCodes.CAPTCHA_EXPIRED, "图形验证码已过期"))
                    .when(captchaService)
                    .verify(anyString(), anyString());

            assertThrows(
                    BusinessException.class,
                    () -> authService.forgotPassword("13800138000", "c1", "A1B2", "127.0.0.1"));

            verify(smsCodeService, never()).sendResetCode(anyString(), anyString());
        }
    }

    @Nested
    class 管理端列表 {
        @Test
        void 合法筛选_手机号脱敏后返回() {
            User user = User.autoRegister("13800138000");
            user.setId(USER_ID);
            user.setNickname("张三");
            user.setCreatedAt(OffsetDateTime.parse("2026-01-01T00:00:00Z"));
            Page<User> page = new Page<>(1, 10);
            page.setRecords(List.of(user));
            page.setTotal(1);
            when(userMapper.selectPage(any(Page.class), any(LambdaQueryWrapper.class)))
                    .thenReturn(page);

            var result = authService.pageAdminUsers(new PageParams(1, 10), new AdminUserQuery("ACTIVE", "138"));

            assertEquals(1, result.total());
            assertEquals("138****8000", result.records().getFirst().phone());
            assertEquals("张三", result.records().getFirst().nickname());
        }

        @Test
        void 非法状态_400且不查库() {
            var ex = assertThrows(
                    BusinessException.class,
                    () -> authService.pageAdminUsers(new PageParams(1, 10), new AdminUserQuery("BANNED", null)));
            assertEquals(400, ex.getHttpStatus());
            verifyNoInteractions(userMapper);
        }
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

            var events = new EventCapture();
            BusinessException ex;
            try (events) {
                ex = assertThrows(
                        BusinessException.class,
                        () -> authService.loginByPassword("13800138000", "pwd", "dev1", "127.0.0.1", "UA"));
            }
            assertEquals(403, ex.getHttpStatus());

            // 对外仍是同一句 USER_DISABLED；对内「已封的号还在试口令」必须可检索
            var fields = events.fields("auth.login.failed");
            assertEquals("disabled", fields.get("reason"));
            assertEquals(USER_ID.toString(), fields.get("user_id"));
            assertEquals("127.0.0.1", fields.get("client_ip"));
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

            var events = new EventCapture();
            try (events) {
                authService.setPassword(USER_ID, null, "newPassword123");
            }

            verify(userMapper).updateById(userCaptor.capture());
            assertEquals("$2a$12$encoded", userCaptor.getValue().getPasswordHash());
            // 换密与吊销全端会话是同一件事的两半，事件里必须看得到是哪半条路径干的
            var fields = events.fields("auth.password.changed");
            assertEquals(USER_ID.toString(), fields.get("user_id"));
            assertEquals("self", fields.get("via"));
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
    class 密码重置 { // AuthService.resetPassword（POST /auth/password/reset）

        @Test
        void 有账号_换密并吊销全端会话_事件带via() {
            var user = new User();
            user.setId(USER_ID);
            user.setPhone("13800138000");
            user.setPasswordHash("$2a$12$oldhash");
            when(userMapper.selectByPhone("13800138000")).thenReturn(user);
            when(passwordEncoder.encode("newPassword123")).thenReturn("$2a$12$encoded");

            var events = new EventCapture();
            try (events) {
                authService.resetPassword("13800138000", "123456", "newPassword123");
            }

            verify(smsCodeService).verifyResetCode("13800138000", "123456");
            // RESET-03：走过短信码换密，旧会话一律不作数
            verify(refreshTokenStore).revokeAll(USER_ID.toString());
            var fields = events.fields("auth.password.changed");
            assertEquals(USER_ID.toString(), fields.get("user_id"));
            assertEquals("reset_code", fields.get("via"));
        }

        @Test
        void 无账号_静默成功_不凭空记一次换密() {
            when(userMapper.selectByPhone("13800138000")).thenReturn(null);

            var events = new EventCapture();
            try (events) {
                assertDoesNotThrow(() -> authService.resetPassword("13800138000", "123456", "newPassword123"));
            }

            // 对外不能暴露「这个号存不存在」（RESET-02），对内也不能留一条无中生有的换密记录
            assertFalse(events.emitted("auth.password.changed"));
            verify(userMapper, never()).updateById(any(User.class));
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

        @Test
        void 续期是refreshed不是登录() {
            // 登录成功事件曾打在共用的签发方法里：一次在线会话每 10 分钟刷新一次，
            // 登录量就被放大成百倍，漏斗与「谁在这台设备上登录过」都读不出真相
            String token = "rt:valid";
            when(refreshTokenStore.rotate(token, "dev1", "[AUTH]"))
                    .thenReturn(new RefreshTokenStore.Rotation(USER_ID.toString(), "dev1"));
            var active = new User();
            active.setId(USER_ID);
            active.setStatus(UserStatus.ACTIVE);
            when(userMapper.selectById(USER_ID)).thenReturn(active);
            when(jwtProvider.createAccessToken(USER_ID)).thenReturn("new-at");
            when(jwtProvider.generateRefreshToken()).thenReturn("rt:new");

            var events = new EventCapture();
            try (events) {
                authService.refresh(token, "dev1", "127.0.0.1", "UA");
            }

            assertFalse(events.emitted("auth.login.succeeded"));
            assertEquals(
                    USER_ID.toString(), events.fields("auth.token.refreshed").get("user_id"));
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

            authService.updateUserStatus(USER_ID, UserStatus.DISABLED, OPERATOR_ID);

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

            authService.updateUserStatus(USER_ID, UserStatus.ACTIVE, OPERATOR_ID);

            verify(userMapper).updateById(userCaptor.capture());
            assertEquals(UserStatus.ACTIVE, userCaptor.getValue().getStatus());
        }

        @Test
        void 封号事件记下被禁账号与操作人() {
            User user = new User();
            user.setId(USER_ID);
            user.setStatus(UserStatus.ACTIVE);
            when(userMapper.selectById(USER_ID)).thenReturn(user);

            var events = new EventCapture();
            try (events) {
                authService.updateUserStatus(USER_ID, UserStatus.DISABLED, OPERATOR_ID);
            }

            var fields = events.fields("account.status.changed");
            assertEquals(USER_ID.toString(), fields.get("user_id"));
            assertEquals("DISABLED", fields.get("status"));
            // 没有 staff_id 的封号日志等于「有人封了号，不知道是谁」
            assertEquals(OPERATOR_ID.toString(), fields.get("staff_id"));
        }

        @Test
        void 用户不存在_404() {
            when(userMapper.selectById(USER_ID)).thenReturn(null);

            var ex = assertThrows(
                    BusinessException.class,
                    () -> authService.updateUserStatus(USER_ID, UserStatus.DISABLED, OPERATOR_ID));
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
