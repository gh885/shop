package com.shop.platform.shop.infra;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

import com.shop.platform.account.api.SubaccountReadQuery;
import com.shop.platform.account.api.SubaccountSession;
import com.shop.platform.common.BusinessException;
import com.shop.platform.common.ShopIdHolder;
import com.shop.platform.common.SubaccountContext;
import com.shop.platform.infra.web.FilterExceptionHandler;
import com.shop.platform.shop.mapper.ShopMapper;
import com.shop.platform.shop.mapper.ShopMember;
import com.shop.platform.shop.mapper.ShopMemberMapper;
import com.shop.platform.shop.model.MemberRole;
import jakarta.servlet.FilterChain;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
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
    private final SubaccountReadQuery subaccounts = mock(SubaccountReadQuery.class);
    private final FilterExceptionHandler errors = mock(FilterExceptionHandler.class);
    private final FilterChain chain = mock(FilterChain.class);
    private final MockHttpServletRequest request = new MockHttpServletRequest("GET", "/seller/products");
    private final MockHttpServletResponse response = new MockHttpServletResponse();
    private final ShopMembershipFilter filter = new ShopMembershipFilter(members, shops, subaccounts, errors);

    @BeforeEach
    void setUp() {
        request.addHeader("X-Shop-Id", UUID.randomUUID());
    }

    @AfterEach
    void tearDown() {
        ShopIdHolder.clear();
        ShopMemberContext.clear();
        SubaccountContext.clear();
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

    // ————— 子账号：店自带，且与 X-Shop-Id 的一致性有闸门 —————

    @Test
    void 子账号_店自带_不吃X_Shop_Id也能装载上下文() throws Exception {
        UUID subaccountId = UUID.randomUUID();
        UUID shopId = UUID.randomUUID();
        // 刻意不带 X-Shop-Id：子账号的店在凭证上
        var freshRequest = new MockHttpServletRequest("GET", "/seller/products");
        when(subaccounts.findActiveSession(subaccountId))
                .thenReturn(Optional.of(new SubaccountSession(subaccountId, shopId, List.of("PRODUCT_MANAGE"))));
        when(shops.existsUsable(shopId)).thenReturn(true);
        SubaccountContext.set(subaccountId);
        // 上下文在 finally 里清理，所以断言必须在过滤链内部做（与旧用例同一写法）
        doAnswer(invocation -> {
                    assertEquals(shopId, ShopIdHolder.get());
                    assertNotNull(ShopMemberContext.get());
                    return null;
                })
                .when(chain)
                .doFilter(freshRequest, response);

        filter.doFilter(freshRequest, response, chain);

        verify(chain).doFilter(freshRequest, response);
        verifyNoInteractions(errors);
    }

    @Test
    void 子账号带了别家店的X_Shop_Id_403且不进下游() throws Exception {
        UUID subaccountId = UUID.randomUUID();
        UUID ownShopId = UUID.randomUUID();
        when(subaccounts.findActiveSession(subaccountId))
                .thenReturn(Optional.of(new SubaccountSession(subaccountId, ownShopId, List.of())));
        when(shops.existsUsable(ownShopId)).thenReturn(true);
        SubaccountContext.set(subaccountId);
        // request 的 X-Shop-Id 是另一个店

        filter.doFilter(request, response, chain);

        verify(errors).resolve(eq(request), eq(response), isA(BusinessException.class));
        verifyNoInteractions(chain);
    }

    @Test
    void 子账号_非ACTIVE取不到会话_403() throws Exception {
        UUID subaccountId = UUID.randomUUID();
        when(subaccounts.findActiveSession(subaccountId)).thenReturn(Optional.empty());
        SubaccountContext.set(subaccountId);

        filter.doFilter(request, response, chain);

        verify(errors).resolve(eq(request), eq(response), isA(BusinessException.class));
        verifyNoInteractions(chain);
    }
}
