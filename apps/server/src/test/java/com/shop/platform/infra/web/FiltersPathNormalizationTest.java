package com.shop.platform.infra.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.shop.platform.admin.infra.StaffAuthFilter;
import com.shop.platform.auth.infra.JwtAuthFilter;
import com.shop.platform.common.UserIdHolder;
import com.shop.platform.infra.security.JwtProperties;
import com.shop.platform.infra.security.JwtProvider;
import com.shop.platform.shop.infra.ShopMembershipFilter;
import com.shop.platform.shop.mapper.ShopMapper;
import com.shop.platform.shop.mapper.ShopMemberMapper;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.ObjectMapper;

/**
 * 过滤链路径前缀判断的防绕过回归测试。
 *
 * <p>getRequestURI() 是未解码原文而 Spring MVC 按解码后路由：/%61dmin 这类编码变体曾可携带
 * C 端用户 token 绕过 StaffAuthFilter 直接命中管理端接口（实测复现过）。契约：
 * 非规范路径一律 400；规范路径下各过滤链行为不变。
 *
 * <p>编码变体经 standalone MockMvc 可如实复现（builder 不改写 requestURI）；
 * 点号段/双斜杠会被 MockMvc 自行规范化、过滤器看不到原文，故这部分走 RequestPaths 单测。
 */
class FiltersPathNormalizationTest {

    private final JwtProvider jwtProvider = new JwtProvider(new JwtProperties());

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        var staffAuthFilter = new StaffAuthFilter(jwtProvider, new ObjectMapper());
        var jwtAuthFilter = new JwtAuthFilter(jwtProvider, new JwtProperties(), new ObjectMapper());
        // ShopMembershipFilter 只在缺 X-Shop-Id 时触达 mapper，正常用例到不了 DB
        var shopMembershipFilter =
                new ShopMembershipFilter(mock(ShopMemberMapper.class), mock(ShopMapper.class), new ObjectMapper());

        mockMvc = MockMvcBuilders.standaloneSetup(new ProbeController())
                .addFilters(staffAuthFilter, jwtAuthFilter, shopMembershipFilter)
                .build();
    }

    @AfterEach
    void tearDown() {
        UserIdHolder.clear();
    }

    private String userToken() {
        return jwtProvider.createAccessToken(UUID.randomUUID());
    }

    private String staffToken() {
        return jwtProvider.createStaffAccessToken(UUID.randomUUID());
    }

    @Test
    void encodedAdminPathIsRejected() throws Exception {
        // 解码后命中管理端路由的变体：修复前这里会 200 泄漏数据，现在必须 400
        mockMvc.perform(get("/%61dmin/secret").header("Authorization", "Bearer " + userToken()))
                .andExpect(status().isBadRequest());
        mockMvc.perform(get("/adm%69n/secret").header("Authorization", "Bearer " + userToken()))
                .andExpect(status().isBadRequest());
    }

    @Test
    void legitAdminPathStillRequiresStaffToken() throws Exception {
        // 规范路径行为不变：用户 token 仍被员工过滤链拒绝
        mockMvc.perform(get("/admin/secret").header("Authorization", "Bearer " + userToken()))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("INVALID_TOKEN"));
    }

    @Test
    void staffTokenReachesAdminController() throws Exception {
        mockMvc.perform(get("/admin/secret").header("Authorization", "Bearer " + staffToken()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ok").value(true));
    }

    // ---------- RequestPaths 单测：MockMvc 会预规范化点号段/双斜杠，只能在这里控制原始 URI ----------

    @Test
    void routePathRejectsNonCanonicalPaths() {
        assertThat(routeOf("/api/../admin/secret")).isNull(); // 容器归一化后命中 /admin
        assertThat(routeOf("/seller/./secret")).isNull();
        assertThat(routeOf("//admin/secret")).isNull();
        assertThat(routeOf("/admin/secret;x=1")).isNull(); // 路径参数被容器剥离
        assertThat(routeOf("/seller%2Fproducts")).isNull();
    }

    @Test
    void routePathPassesCleanPathAndStripsContextPath() {
        assertThat(routeOf("/admin/secret")).isEqualTo("/admin/secret");
        assertThat(routeOf("/seller/products")).isEqualTo("/seller/products");

        var withContext = new MockHttpServletRequest("GET", "/shop/admin/secret");
        withContext.setContextPath("/shop");
        assertThat(RequestPaths.routePath(withContext)).isEqualTo("/admin/secret");
    }

    private String routeOf(String uri) {
        return RequestPaths.routePath(new MockHttpServletRequest("GET", uri));
    }
}

@RestController
class ProbeController {

    @GetMapping("/admin/secret")
    Probe ok1() {
        return new Probe();
    }

    @GetMapping("/seller/secret")
    Probe ok2() {
        return new Probe();
    }

    record Probe(boolean ok) {
        Probe() {
            this(true);
        }
    }
}
