package com.shop.platform.infra.web;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerExceptionResolver;
import org.springframework.web.servlet.ModelAndView;

/** 把过滤器中的业务与技术异常交给 MVC 的统一异常处理器，避免 filter/interceptor 层另写一份 ProblemDetail。 */
@Component
public class FilterExceptionHandler {

    private final HandlerExceptionResolver exceptionResolver;

    public FilterExceptionHandler(@Qualifier("handlerExceptionResolver") HandlerExceptionResolver exceptionResolver) {
        this.exceptionResolver = exceptionResolver;
    }

    public void resolve(HttpServletRequest request, HttpServletResponse response, RuntimeException exception) {
        ModelAndView resolved = exceptionResolver.resolveException(request, response, null, exception);
        if (resolved == null) {
            throw exception;
        }
    }
}
