package com.shop.platform.testsupport;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.shop.platform.admin.infra.StaffAuthFilter;
import com.shop.platform.admin.service.ShopReviewService;
import com.shop.platform.admin.service.StaffService;
import com.shop.platform.auth.infra.JwtAuthFilter;
import com.shop.platform.auth.service.AuthService;
import com.shop.platform.auth.service.SmsCodeService;
import com.shop.platform.cart.service.CartService;
import com.shop.platform.cms.service.ContentService;
import com.shop.platform.common.ShopIdHolder;
import com.shop.platform.common.UserIdHolder;
import com.shop.platform.favorite.service.FavoriteService;
import com.shop.platform.infra.captcha.CaptchaService;
import com.shop.platform.infra.security.JwtProvider;
import com.shop.platform.infra.web.RequestBodySizeFilter;
import com.shop.platform.infra.web.RequestIdFilter;
import com.shop.platform.inventory.api.StockReadQuery;
import com.shop.platform.order.service.OrderService;
import com.shop.platform.payment.service.PaymentService;
import com.shop.platform.product.service.CategoryService;
import com.shop.platform.product.service.ProductService;
import com.shop.platform.shop.infra.ShopMembershipFilter;
import com.shop.platform.shop.mapper.Shop;
import com.shop.platform.shop.mapper.ShopMapper;
import com.shop.platform.shop.mapper.ShopMember;
import com.shop.platform.shop.mapper.ShopMemberMapper;
import com.shop.platform.shop.service.ShopService;
import com.shop.platform.user.service.AddressService;
import java.util.UUID;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

/**
 * 接口层（HTTP 契约）测试基座：全量启动应用上下文，service 一律 mock，
 * 请求走真实过滤器链（RequestId → BodySize → StaffAuth → JwtAuth → ShopMembership）。
 *
 * <p>数据库：所有测试上下文统一连专用库 shop_test（见 application-test.yml），Flyway 迁移一次后共享；
 * 与 dev 库彻底隔离。曾经试图 exclude DataSource 自动配置，但 Boot 4 已迁移自动配置类包名，
 * 旧全限定名排除无效——与其假装无库，不如统一指向隔离库。
 *
 * <p>测的是接口契约：路由、认证守卫、参数校验、错误码透传、响应序列化形状；
 * 业务逻辑归单元测试与真库 IT，这里不重复。
 *
 * <p>全部 service 的 {@code @MockitoBean} 集中在本基类——子类共享同一个缓存上下文，
 * 整个套件只起一次 Spring 容器。子类按需 stub 继承来的 mock 字段即可
 * （@MockitoBean 不做 strict-stub 检查，未用到的 stub 无副作用）。
 */
@SpringBootTest
@ActiveProfiles("test")
public abstract class WebControllerTestSupport {

    @Autowired
    protected WebApplicationContext context;

    @Autowired
    protected JwtProvider jwtProvider;

    protected MockMvc mockMvc;

    // ---- 全量 service mock：一个上下文服务所有控制器测试 ----

    @MockitoBean
    protected AuthService authService;

    @MockitoBean
    protected SmsCodeService smsCodeService;

    @MockitoBean
    protected CaptchaService captchaService;

    @MockitoBean
    protected CartService cartService;

    @MockitoBean
    protected AddressService addressService;

    @MockitoBean
    protected FavoriteService favoriteService;

    @MockitoBean
    protected ProductService productService;

    @MockitoBean
    protected CategoryService categoryService;

    @MockitoBean
    protected OrderService orderService;

    @MockitoBean
    protected PaymentService paymentService;

    @MockitoBean
    protected ShopService shopService;

    @MockitoBean
    protected ContentService contentService;

    @MockitoBean
    protected ShopReviewService shopReviewService;

    @MockitoBean
    protected StaffService staffService;

    /** 跨模块库存查询接口（product 控制器拼装 SKU 库存展示用） */
    @MockitoBean
    protected StockReadQuery stockReadQuery;

    /** RefreshTokenStore 构造依赖，剔除了 Redis 自动配置后补位 */
    @MockitoBean
    protected StringRedisTemplate stringRedisTemplate;

    /** /seller/** 成员过滤器触达的两个 mapper，seller 测试按需 stub */
    @MockitoBean
    protected ShopMapper shopMapper;

    @MockitoBean
    protected ShopMemberMapper shopMemberMapper;

    @BeforeEach
    void setUpWebMvc() {
        // 每用例前清 ThreadLocal 上下文（UserIdHolder + 卖家侧 ShopIdHolder），
        // 隔离器在基类集中做，各子类不必再写 @AfterEach clearContext。
        UserIdHolder.clear();
        ShopIdHolder.clear();
        // 判权默认桩：契约测试假定持全权的在岗员工（SUPER_ADMIN 通配）；
        // 权限矩阵测试自行覆盖此桩（如 OPS 只给 CMS_MANAGE）。
        // @MockitoBean 每用例自动 reset，这里的 stub 对每个测试重新生效。
        when(staffService.effectivePermissions(any()))
                .thenReturn(java.util.Set.of(com.shop.platform.infra.security.authz.PermissionResolver.WILDCARD));
        // webAppContextSetup 不自动注册 Filter Bean，按生产 @Order 手动挂全链
        mockMvc = MockMvcBuilders.webAppContextSetup(context)
                .addFilters(
                        context.getBean(RequestIdFilter.class),
                        context.getBean(RequestBodySizeFilter.class),
                        context.getBean(StaffAuthFilter.class),
                        context.getBean(JwtAuthFilter.class),
                        context.getBean(ShopMembershipFilter.class))
                .build();
    }

    /** C 端用户访问令牌（kind=user） */
    protected String userToken(UUID userId) {
        return jwtProvider.createAccessToken(userId);
    }

    /** 已登录用户请求后处理器：自动挂 C 端 Bearer 令牌 + 设 JSON content-type，一行替掉
     *  {@code .header("Authorization", ...) + .contentType(APPLICATION_JSON)} 两行样板。
     *  登录态请求统一 {@code .with(userAuth(userId))}；未登录守卫用例（401）照旧不带；
     *  GET/DELETE 无请求体时加 content-type 头无害（无体则 Spring 忽略）。 */
    protected RequestPostProcessor userAuth(UUID userId) {
        return (req) -> {
            req.addHeader(HttpHeaders.AUTHORIZATION, "Bearer " + userToken(userId));
            req.setContentType(MediaType.APPLICATION_JSON_VALUE);
            return req;
        };
    }

    /** 管理端员工令牌（kind=staff） */
    protected String staffToken(UUID staffId) {
        return jwtProvider.createStaffAccessToken(staffId);
    }

    /** 管理端员工请求后处理器：自动挂 staff Bearer 令牌 + 设 JSON content-type，
     *  与 {@link #userAuth} 对位。管理端登录态请求统一 {@code .with(staffAuth(staffId))}。 */
    protected RequestPostProcessor staffAuth(UUID staffId) {
        return (req) -> {
            req.addHeader(HttpHeaders.AUTHORIZATION, "Bearer " + staffToken(staffId));
            req.setContentType(MediaType.APPLICATION_JSON_VALUE);
            return req;
        };
    }

    /** seller 测试的成员过滤器放行桩：店铺存在可用 + 当前用户是 ACTIVE 店主（通配全通过）。
     *  剔除了数据源后 MP 的 lambda 缓存未初始化（mapper 未加载），过滤器里的 LambdaQueryWrapper 会炸，先手动注册表信息。 */
    protected void stubSellerMembership() {
        MapperBuilderAssistant assistant = new MapperBuilderAssistant(new MybatisConfiguration(), "");
        // ShopMember 开了 autoResultMap（permissions jsonb），构建 ResultMap 需要各字段的 TypeHandler；
        // 裸配置里缺 UUID 的注册，这里补上（生产侧由 infra.db.MyBatisConfig 注册）
        assistant
                .getConfiguration()
                .getTypeHandlerRegistry()
                .register(UUID.class, new com.shop.platform.infra.db.UuidTypeHandler());
        TableInfoHelper.initTableInfo(assistant, Shop.class);
        TableInfoHelper.initTableInfo(assistant, ShopMember.class);
        when(shopMapper.selectCount(any())).thenReturn(1L);
        when(shopMemberMapper.findActiveMember(any(), any()))
                .thenReturn(ShopMember.builder()
                        .shopId(UUID.randomUUID())
                        .userId(UUID.randomUUID())
                        .role(ShopMember.ROLE_OWNER)
                        .status(ShopMember.STATUS_ACTIVE)
                        .permissions(java.util.List.of())
                        .build());
    }
}
