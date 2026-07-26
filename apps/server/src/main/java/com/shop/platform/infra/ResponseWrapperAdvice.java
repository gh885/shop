package com.shop.platform.infra;

import com.shop.platform.common.ApiMeta;
import com.shop.platform.common.ApiResponse;
import com.shop.platform.common.OffsetDateTimeProvider;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.core.MethodParameter;
import org.springframework.http.MediaType;
import org.springframework.http.converter.HttpMessageConverter;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.http.server.ServletServerHttpRequest;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.mvc.method.annotation.ResponseBodyAdvice;

/** 将成功响应自动包裹为 { data, meta } 格式。 */
@RestControllerAdvice
public class ResponseWrapperAdvice implements ResponseBodyAdvice<Object> {

    @Override
    public boolean supports(
            MethodParameter returnType, Class<? extends HttpMessageConverter<?>> converterType) {
        Class<?> type = returnType.getParameterType();
        return !ApiResponse.class.isAssignableFrom(type)
                && !HttpServletRequest.class.isAssignableFrom(type)
                && type != void.class
                && type != Void.class
                && type != String.class;
    }

    @Override
    public Object beforeBodyWrite(
            Object body,
            MethodParameter returnType,
            MediaType selectedContentType,
            Class<? extends HttpMessageConverter<?>> selectedConverterType,
            ServerHttpRequest request,
            ServerHttpResponse response) {
        HttpServletRequest servletRequest =
                ((ServletServerHttpRequest) request).getServletRequest();
        String requestId = RequestIdFilter.getRequestId(servletRequest);
        ApiMeta meta = new ApiMeta(requestId, OffsetDateTimeProvider.now());
        return new ApiResponse<>(body, meta);
    }
}
