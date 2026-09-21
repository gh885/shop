package com.shop.platform.account;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.shop.platform.account.mapper.Staff;
import com.shop.platform.account.mapper.StaffMapper;
import com.shop.platform.account.model.StaffStatus;
import com.shop.platform.account.service.StaffService;
import com.shop.platform.common.BusinessException;
import com.shop.platform.infra.security.JwtProvider;
import com.shop.platform.infra.security.RefreshTokenStore;
import java.util.UUID;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Captor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
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

    @InjectMocks
    StaffService staffService;

    private static final UUID STAFF_ID = UUID.randomUUID();

    @Captor
    ArgumentCaptor<Staff> staffCaptor;

    @Nested
    class 管理端封号 { // StaffService.updateStaffStatus（PATCH /admin/staff/{id}/status）

        @Test
        void 禁用_落DISABLED并吊销全端会话() {
            Staff staff = new Staff();
            staff.setId(STAFF_ID);
            staff.setStatus(StaffStatus.ACTIVE);
            when(staffMapper.selectById(STAFF_ID)).thenReturn(staff);

            staffService.updateStaffStatus(STAFF_ID, StaffStatus.DISABLED);

            verify(staffMapper).updateById(staffCaptor.capture());
            assertEquals(StaffStatus.DISABLED, staffCaptor.getValue().getStatus());
            // 员工 access 寿命 8 小时，禁用必须同步清 refresh 才能即时收场
            verify(refreshTokenStore).revokeAll(STAFF_ID.toString());
        }

        @Test
        void 启用_恢复ACTIVE不吊销会话() {
            Staff staff = new Staff();
            staff.setId(STAFF_ID);
            staff.setStatus(StaffStatus.DISABLED);
            when(staffMapper.selectById(STAFF_ID)).thenReturn(staff);

            staffService.updateStaffStatus(STAFF_ID, StaffStatus.ACTIVE);

            verify(staffMapper).updateById(staffCaptor.capture());
            assertEquals(StaffStatus.ACTIVE, staffCaptor.getValue().getStatus());
            verify(refreshTokenStore, never()).revokeAll(anyString());
        }

        @Test
        void 员工不存在_404_不动会话() {
            when(staffMapper.selectById(STAFF_ID)).thenReturn(null);

            var ex = assertThrows(
                    BusinessException.class, () -> staffService.updateStaffStatus(STAFF_ID, StaffStatus.DISABLED));
            assertEquals(404, ex.getHttpStatus());
            verify(staffMapper, never()).updateById(any(Staff.class));
            verify(refreshTokenStore, never()).revokeAll(anyString());
        }

        @Test
        void 禁用员工_刷新被状态闸门拦_403() {
            // 封号闸门验证：rotate 消费旧码后撞状态检查，STAFF_DISABLED 403，新令牌不签发
            String token = "rt:consumed";
            when(refreshTokenStore.rotate(token, "dev1", "[STAFF]")).thenReturn(STAFF_ID.toString());
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
