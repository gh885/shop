package com.shop.platform.shop.infra;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

import com.shop.platform.common.BusinessException;
import com.shop.platform.common.ShopIdHolder;
import com.shop.platform.infra.web.FilterExceptionHandler;
import com.shop.platform.shop.mapper.ShopMapper;
import com.shop.platform.shop.mapper.ShopMember;
import com.shop.platform.shop.mapper.ShopMemberMapper;
import com.shop.platform.shop.model.MemberRole;
import jakarta.servlet.FilterChain;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

class ShopMembershipFilterTest {
    private final ShopMapper shops = mock(ShopMapper.class);
    private final ShopMemberMapper members = mock(ShopMemberMapper.class);
    private final FilterExceptionHandler errors = mock(FilterExceptionHandler.class);
    private final FilterChain chain = mock(FilterChain.class);
    private final MockHttpServletRequest request = new MockHttpServletRequest("GET", "/seller/products");
    private final MockHttpServletResponse response = new MockHttpServletResponse();
    private final ShopMembershipFilter filter = new ShopMembershipFilter(members, shops, errors);

    @BeforeEach
    void setUp() {
        request.addHeader("X-Shop-Id", UUID.randomUUID());
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void 查询技术异常_交统一出口且不进入下游(boolean memberLookup) throws Exception {
        var failure = new DataAccessResourceFailureException("database unavailable");
        if (memberLookup) {
            when(shops.existsUsable(any())).thenReturn(true);
            when(members.findActiveMember(any(), any())).thenThrow(failure);
        } else {
            when(shops.existsUsable(any())).thenThrow(failure);
        }
        filter.doFilter(request, response, chain);
        verify(errors).resolve(request, response, failure);
        verifyNoInteractions(chain);
        assertNull(ShopIdHolder.get());
        assertNull(ShopMemberContext.get());
    }

    @Test
    void 业务拒绝_仍交统一出口() throws Exception {
        filter.doFilter(request, response, chain);
        verify(errors).resolve(eq(request), eq(response), isA(BusinessException.class));
        verifyNoInteractions(chain);
    }

    @Test
    void 下游异常_不重复写错误响应且清理上下文() throws Exception {
        when(shops.existsUsable(any())).thenReturn(true);
        when(members.findActiveMember(any(), any()))
                .thenReturn(ShopMember.builder()
                        .role(MemberRole.OWNER)
                        .permissions(List.of())
                        .build());
        var failure = new IllegalStateException("downstream");
        doAnswer(invocation -> {
                    assertNotNull(ShopIdHolder.get());
                    assertNotNull(ShopMemberContext.get());
                    throw failure;
                })
                .when(chain)
                .doFilter(request, response);
        assertSame(failure, assertThrows(IllegalStateException.class, () -> filter.doFilter(request, response, chain)));
        verifyNoInteractions(errors);
        assertNull(ShopIdHolder.get());
        assertNull(ShopMemberContext.get());
    }
}
