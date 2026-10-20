package com.shop.platform.common;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

/**
 * 业务异常的可选 code 语义（错误契约的源头，见「错误码判据」）：
 * 前端能用 HTTP status 区分时不带 code，带 code 时才在响应里多一个字段。
 *
 * <p>工厂方法 → status 的映射不在这里重复断言——那属于 wire 契约，归
 * {@link com.shop.platform.infra.web.GlobalExceptionHandlerTest} 从 handler 侧锁死。
 */
class BusinessExceptionTest {

    @Test
    void code可选语义_前端能用status区分时不传code() {
        BusinessException noCode = BusinessException.badRequest("密码强度不足");
        assertThat(noCode.getCode()).isNull();
        assertThat(noCode.getDetail()).isEqualTo("密码强度不足");

        BusinessException withCode = new BusinessException(400, "SMS_CODE_EXPIRED", "验证码已过期");
        assertThat(withCode.getCode()).isEqualTo("SMS_CODE_EXPIRED");
        // message 即 detail：日志里直接可读
        assertThat(withCode).hasMessage("验证码已过期");
    }
}
