package com.shop.platform.account;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.shop.platform.account.api.StaffReadQuery;
import com.shop.platform.account.dto.AdminStaffQuery;
import com.shop.platform.account.mapper.Staff;
import com.shop.platform.account.mapper.StaffMapper;
import com.shop.platform.account.model.StaffStatus;
import com.shop.platform.account.service.StaffService;
import com.shop.platform.audit.api.RecordAuditCommand;
import com.shop.platform.common.BusinessException;
import com.shop.platform.common.PageParams;
import com.shop.platform.infra.security.JwtProvider;
import com.shop.platform.infra.security.RefreshTokenStore;
import com.shop.platform.testsupport.EventCapture;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Captor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.security.crypto.password.PasswordEncoder;

@ExtendWith(MockitoExtension.class)
class StaffServiceTest {

    @Mock
    StaffMapper staffMapper;

    @Mock
    JwtProvider jwtProvider;

    @Mock
    PasswordEncoder passwordEncoder;

    @Mock
    RefreshTokenStore refreshTokenStore;

    @Mock
    StringRedisTemplate redis;

    @Mock
    RecordAuditCommand recordAuditCommand;

    @Mock
    StaffReadQuery staffReadQuery;

    @InjectMocks
    StaffService staffService;

    private static final UUID STAFF_ID = UUID.randomUUID();
    private static final UUID OPERATOR_ID = UUID.randomUUID();

    @Captor
    ArgumentCaptor<Staff> staffCaptor;

    @Nested
    class 管理端列表 {
        @Test
        void 合法筛选_岗位转稳定枚举名() {
            Staff staff = new Staff();
            staff.setId(STAFF_ID);
            staff.setEmployeeNo("E001");
            staff.setDisplayName("张三");
            staff.setStatus(StaffStatus.ACTIVE);
            staff.setRole("OPS");
            staff.setCreatedAt(OffsetDateTime.parse("2026-01-01T00:00:00Z"));
            Page<Staff> page = new Page<>(1, 10);
            page.setRecords(List.of(staff));
            page.setTotal(1);
            when(staffMapper.selectPageAdmin(new PageParams(1, 10), StaffStatus.ACTIVE, "E001"))
                    .thenReturn(page);

            var result = staffService.pageAdminStaff(new PageParams(1, 10), new AdminStaffQuery("ACTIVE", "E001"));

            assertEquals(1, result.total());
            assertEquals("OPS", result.records().getFirst().role());
            assertEquals("E001", result.records().getFirst().employeeNo());
        }

        @Test
        void 未知岗位_出参为空且列表不中断() {
            Staff staff = new Staff();
            staff.setId(STAFF_ID);
            staff.setEmployeeNo("E404");
            staff.setStatus(StaffStatus.ACTIVE);
            staff.setRole("LEGACY");
            Page<Staff> page = new Page<>(1, 10);
            page.setRecords(List.of(staff));
            page.setTotal(1);
            when(staffMapper.selectPageAdmin(new PageParams(1, 10), null, null)).thenReturn(page);

            var result = staffService.pageAdminStaff(new PageParams(1, 10), new AdminStaffQuery(null, null));

            assertNull(result.records().getFirst().role());
        }

        @Test
        void 非法状态_400且不查库() {
            var ex = assertThrows(
                    BusinessException.class,
                    () -> staffService.pageAdminStaff(new PageParams(1, 10), new AdminStaffQuery("LOCKED", null)));
            assertEquals(400, ex.getHttpStatus());
            verifyNoInteractions(staffMapper);
        }
    }

    @Nested
    class 登录 { // StaffService.login（POST /admin/auth/login）

        @Test
        void 工号不存在_仍比对占位哈希_防按时序枚举() {
            when(staffMapper.selectByEmployeeNo("E404")).thenReturn(null);
            when(passwordEncoder.matches(anyString(), anyString())).thenReturn(false);

            assertThrows(BusinessException.class, () -> staffService.login("E404", "pwd", "dev1", "1.1.1.1"));
            // 查无此工号也要跑一次 KDF，否则响应耗时直接说出「有没有这个工号」（LOGIN-01）
            verify(passwordEncoder).matches(eq("pwd"), anyString());
        }

        @Test
        void 工号不存在_事件带掩码工号不带staff_id() {
            when(staffMapper.selectByEmployeeNo("E404")).thenReturn(null);
            when(passwordEncoder.matches(anyString(), anyString())).thenReturn(false);

            var events = new EventCapture();
            try (events) {
                assertThrows(BusinessException.class, () -> staffService.login("E404", "pwd", "dev1", "1.1.1.1"));
            }

            var fields = events.fields("staff.login.failed");
            assertEquals("staff_not_found", fields.get("reason"));
            assertNull(fields.get("staff_id"));
            // 工号是半标识符：只落掩码，且不能整串进字段
            assertEquals("E***04", fields.get("employee_no"));
        }

        @Test
        void 已禁用员工试登录_事件记disabled() {
            var disabled = new Staff();
            disabled.setId(STAFF_ID);
            disabled.setPasswordHash("$2a$12$hash");
            disabled.setStatus(StaffStatus.DISABLED);
            when(staffMapper.selectByEmployeeNo("E001")).thenReturn(disabled);
            when(passwordEncoder.matches(anyString(), anyString())).thenReturn(true);

            var events = new EventCapture();
            try (events) {
                var ex = assertThrows(
                        BusinessException.class, () -> staffService.login("E001", "pwd", "dev1", "1.1.1.1"));
                assertEquals(403, ex.getHttpStatus());
            }
            // 口令对上了但人被封着——这条要是记不下来，就没人知道被封的员工还在试
            var fields = events.fields("staff.login.failed");
            assertEquals("disabled", fields.get("reason"));
            assertEquals(STAFF_ID.toString(), fields.get("staff_id"));
        }

        @Test
        void 超限流窗口_401_不碰员工表() {
            when(redis.execute(any(RedisScript.class), anyList(), any())).thenReturn(11L);

            var ex = assertThrows(BusinessException.class, () -> staffService.login("E001", "pwd", "dev1", "1.1.1.1"));
            assertEquals(401, ex.getHttpStatus());
            verify(staffMapper, never()).selectByEmployeeNo(anyString());
        }
    }

    @Nested
    class 管理端封号 { // StaffService.updateStaffStatus（PATCH /admin/staff/{id}/status）

        @Test
        void 禁用_落DISABLED并吊销全端会话() {
            Staff staff = new Staff();
            staff.setId(STAFF_ID);
            staff.setStatus(StaffStatus.ACTIVE);
            when(staffMapper.selectById(STAFF_ID)).thenReturn(staff);

            staffService.updateStaffStatus(STAFF_ID, StaffStatus.DISABLED, OPERATOR_ID);

            verify(staffMapper).updateById(staffCaptor.capture());
            assertEquals(StaffStatus.DISABLED, staffCaptor.getValue().getStatus());
            // 员工 access 寿命 8 小时，禁用必须同步清 refresh 才能即时收场
            verify(refreshTokenStore).revokeAll(STAFF_ID.toString());
        }

        @Test
        void 封号事件分清被禁员工与操作人() {
            Staff staff = new Staff();
            staff.setId(STAFF_ID);
            staff.setStatus(StaffStatus.ACTIVE);
            when(staffMapper.selectById(STAFF_ID)).thenReturn(staff);

            var events = new EventCapture();
            try (events) {
                staffService.updateStaffStatus(STAFF_ID, StaffStatus.DISABLED, OPERATOR_ID);
            }

            // 两个都是 staff id，共用一个键名就再也分不出「谁被封」和「谁干的」
            var fields = events.fields("staff.status.changed");
            assertEquals(STAFF_ID.toString(), fields.get("staff_id"));
            assertEquals(OPERATOR_ID.toString(), fields.get("operator_id"));
            assertEquals("DISABLED", fields.get("status"));
        }

        @Test
        void 启用_恢复ACTIVE不吊销会话() {
            Staff staff = new Staff();
            staff.setId(STAFF_ID);
            staff.setStatus(StaffStatus.DISABLED);
            when(staffMapper.selectById(STAFF_ID)).thenReturn(staff);

            staffService.updateStaffStatus(STAFF_ID, StaffStatus.ACTIVE, OPERATOR_ID);

            verify(staffMapper).updateById(staffCaptor.capture());
            assertEquals(StaffStatus.ACTIVE, staffCaptor.getValue().getStatus());
            verify(refreshTokenStore, never()).revokeAll(anyString());
        }

        @Test
        void 员工不存在_404_不动会话_不留事件() {
            when(staffMapper.selectById(STAFF_ID)).thenReturn(null);

            var events = new EventCapture();
            BusinessException ex;
            try (events) {
                ex = assertThrows(
                        BusinessException.class,
                        () -> staffService.updateStaffStatus(STAFF_ID, StaffStatus.DISABLED, OPERATOR_ID));
            }
            assertEquals(404, ex.getHttpStatus());
            verify(staffMapper, never()).updateById(any(Staff.class));
            verify(refreshTokenStore, never()).revokeAll(anyString());
            // 404 冒泡的同时不留事件，否则审计里就多出一条「封了一个不存在的员工」
            assertFalse(events.emitted("staff.status.changed"));
        }

        @Test
        void 禁用员工_刷新被状态闸门拦_403() {
            // 封号闸门验证：rotate 消费旧码后撞状态检查，STAFF_DISABLED 403，新令牌不签发
            String token = "rt:consumed";
            when(refreshTokenStore.rotate(token, "dev1", "[STAFF]"))
                    .thenReturn(new RefreshTokenStore.Rotation(STAFF_ID.toString(), "dev1"));
            Staff disabled = new Staff();
            disabled.setId(STAFF_ID);
            disabled.setStatus(StaffStatus.DISABLED);
            when(staffMapper.selectById(STAFF_ID)).thenReturn(disabled);

            var ex = assertThrows(BusinessException.class, () -> staffService.refresh(token, "dev1"));
            assertEquals(403, ex.getHttpStatus());
            assertEquals("STAFF_DISABLED", ex.getCode());
            verify(jwtProvider, never()).createStaffAccessToken(any());
        }
    }
}
