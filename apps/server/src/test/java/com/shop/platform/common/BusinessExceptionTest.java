package com.shop.platform.common;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

/** 业务异常工厂方法的状态码与 code 语义（错误契约的源头，见 docs/error-codes.md）。 */
class BusinessExceptionTest {

    @Test
    void 工厂方法_状态码一一对应() {
        assertThat(BusinessException.badRequest("x").getHttpStatus()).isEqualTo(400);
        assertThat(BusinessException.unauthorized("x").getHttpStatus()).isEqualTo(401);
        assertThat(BusinessException.forbidden("x").getHttpStatus()).isEqualTo(403);
        assertThat(BusinessException.notFound("x").getHttpStatus()).isEqualTo(404);
        assertThat(BusinessException.conflict("CODE", "x").getHttpStatus()).isEqualTo(409);
        assertThat(BusinessException.rateLimited("x").getHttpStatus()).isEqualTo(429);
    }

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
