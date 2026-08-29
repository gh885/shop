package com.shop.platform.infra.web;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import com.shop.platform.common.BusinessException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.ConstraintViolationException;
import jakarta.validation.Path;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.slf4j.MDC;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.validation.BeanPropertyBindingResult;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;

/**
 * 全局异常映射契约：BusinessException/校验/未知字段/缺参/兜底 → RFC 9457 ProblemDetail。
 *
 * <p>这是全项目唯一一处「异常 → HTTP 响应」的映射，值得集中测一次，
 * 而非在 17 个 controller 测试里零散顺带。专测 handler 本身，不起 Spring 上下文。
 *
 * <p>覆盖横切契约：{@code no-store} 缓存头、{@code requestId} 从 MDC 带出、
 * {@code code} 可选分支、{@code errors} 数组透传、各状态码映射。
 */
@ExtendWith(MockitoExtension.class)
class GlobalExceptionHandlerTest {

    @Mock
    ClientIp clientIp;

    @Mock
    HttpServletRequest request;

    GlobalExceptionHandler handler;

    private static final String TRACE_ID = "test-trace-123";

    @BeforeEach
    void setUp() {
        handler = new GlobalExceptionHandler(clientIp);
        MDC.put("trace_id", TRACE_ID);
    }

    @AfterEach
    void tearDown() {
        MDC.clear();
    }

    // ========== 业务异常：code 可选分支 ==========

    @Test
    void 业务异常_带code_映射状态码与横切契约() {
        BusinessException ex = new BusinessException(400, "SMS_CODE_EXPIRED", "验证码已过期");

        ProblemDetail pd = handler.handleBusiness(ex).getBody();

        assertEquals(400, pd.getStatus());
        assertEquals("Bad Request", pd.getTitle());
        assertEquals("验证码已过期", pd.getDetail());
        assertEquals("SMS_CODE_EXPIRED", pd.getProperties().get("code"));
        assertEquals(TRACE_ID, pd.getProperties().get("requestId"));
    }

    @Test
    void 业务异常_无code_不输出code字段() {
        // badRequest(detail) 不带 code → 响应 body 不应有 code 属性（前端靠状态区分）
        BusinessException ex = BusinessException.badRequest("缺少请求参数");

        ProblemDetail pd = handler.handleBusiness(ex).getBody();

        assertFalse(pd.getProperties().containsKey("code"));
        assertEquals("缺少请求参数", pd.getDetail());
    }

    @Test
    void 业务异常_带errors_透传字段级错误() {
        BusinessException ex = new BusinessException(
                400, "ORDER_QTY_INVALID", "数量不合法", List.of(Map.of("field", "quantity", "message", "数量超出上限")));

        ProblemDetail pd = handler.handleBusiness(ex).getBody();

        assertEquals(
                List.of(Map.of("field", "quantity", "message", "数量超出上限")),
                pd.getProperties().get("errors"));
    }

    // ========== 状态码映射（工厂方法代表各业务状态） ==========

    @Test
    void 各业务状态_映射正确状态码() {
        assertEquals(
                401,
                handler.handleBusiness(BusinessException.unauthorized("未登录"))
                        .getBody()
                        .getStatus());
        assertEquals(
                403,
                handler.handleBusiness(BusinessException.forbidden("无权限"))
                        .getBody()
                        .getStatus());
        assertEquals(
                404,
                handler.handleBusiness(BusinessException.notFound("不存在"))
                        .getBody()
                        .getStatus());
        assertEquals(
                409,
                handler.handleBusiness(BusinessException.conflict("DUP", "已存在"))
                        .getBody()
                        .getStatus());
        assertEquals(
                429,
                handler.handleBusiness(BusinessException.rateLimited("太频繁"))
                        .getBody()
                        .getStatus());
    }

    // ========== 横切契约：no-store 缓存头 ==========

    @Test
    void 业务异常_响应带头_NO_STORE_防缓存() {
        ResponseEntity<ProblemDetail> response = handler.handleBusiness(BusinessException.badRequest("x"));

        assertEquals("no-store", response.getHeaders().getFirst(HttpHeaders.CACHE_CONTROL));
    }

    // ========== 校验异常 ==========

    @Test
    void 参数校验_422_errors字段级明细() {
        BeanPropertyBindingResult binding = new BeanPropertyBindingResult(new Object(), "body");
        binding.addError(new FieldError("body", "quantity", "必须大于0"));
        MethodArgumentNotValidException ex = new MethodArgumentNotValidException(null, binding);

        when(request.getRequestURI()).thenReturn("/cart/items");
        when(clientIp.of(request)).thenReturn("127.0.0.1");

        ProblemDetail pd = handler.handleValidation(ex, request).getBody();

        assertEquals(422, pd.getStatus());
        assertEquals(
                List.of(Map.of("field", "quantity", "message", "必须大于0")),
                pd.getProperties().get("errors"));
    }

    @Test
    void 约束violation_422_与请求体校验同契约() {
        @SuppressWarnings("unchecked")
        ConstraintViolation<Object> violation = mock(ConstraintViolation.class);
        Path path = mock(Path.class);
        when(violation.getPropertyPath()).thenReturn(path);
        when(path.toString()).thenReturn("currentDeviceId");
        when(violation.getMessage()).thenReturn("不能为空");
        ConstraintViolationException ex = new ConstraintViolationException(Set.of(violation));

        ProblemDetail pd = handler.handleConstraintViolation(ex).getBody();

        assertEquals(422, pd.getStatus());
        assertEquals(
                List.of(Map.of("field", "currentDeviceId", "message", "不能为空")),
                pd.getProperties().get("errors"));
    }

    // ========== 请求体/参数解析失败 ==========

    @Test
    void 请求体解析失败_400() {
        HttpMessageNotReadableException ex = new HttpMessageNotReadableException("bad json", null);

        ProblemDetail pd = handler.handleMessageNotReadable(ex).getBody();

        assertEquals(400, pd.getStatus());
        assertEquals("请求体格式错误", pd.getDetail());
    }

    @Test
    void 缺少查询参数_400_不落兜底() {
        MissingServletRequestParameterException ex = new MissingServletRequestParameterException("skuId", "UUID");

        ProblemDetail pd = handler.handleMissingParam(ex).getBody();

        assertEquals(400, pd.getStatus());
        assertEquals("缺少请求参数: skuId", pd.getDetail());
    }

    // ========== 兜底 ==========

    @Test
    void 未捕获异常_500() {
        ProblemDetail pd =
                handler.handleGeneral(new IllegalStateException("boom")).getBody();

        assertEquals(500, pd.getStatus());
        assertEquals("服务器内部错误", pd.getDetail());
    }
}
