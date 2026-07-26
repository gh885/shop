package com.shop.platform.config;

import com.shop.platform.kernel.BusinessException;
import com.shop.platform.kernel.ErrorCodes;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.List;
import java.util.Map;

@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(BusinessException.class)
    public ResponseEntity<ProblemDetail> handleBusiness(BusinessException ex, HttpServletRequest request) {
        ProblemDetail pd = ProblemDetail.forStatus(ex.getHttpStatus());
        pd.setTitle(HttpStatus.valueOf(ex.getHttpStatus()).getReasonPhrase());
        pd.setDetail(ex.getDetail());
        pd.setProperty("code", ex.getCode());
        pd.setProperty("requestId", RequestIdFilter.getRequestId(request));
        return ResponseEntity.status(ex.getHttpStatus())
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .body(pd);
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ProblemDetail> handleValidation(MethodArgumentNotValidException ex,
                                                          HttpServletRequest request) {
        List<Map<String, String>> errors = ex.getBindingResult().getFieldErrors().stream()
                .map(fe -> Map.of("field", fe.getField(), "message", fe.getDefaultMessage()))
                .toList();

        ProblemDetail pd = ProblemDetail.forStatus(422);
        pd.setTitle("Unprocessable Entity");
        pd.setDetail("输入校验失败（" + errors.size() + " 个字段错误）");
        pd.setProperty("code", ErrorCodes.VALIDATION_ERROR);
        pd.setProperty("requestId", RequestIdFilter.getRequestId(request));
        pd.setProperty("errors", errors);
        return ResponseEntity.status(422)
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .body(pd);
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ProblemDetail> handleGeneral(Exception ex, HttpServletRequest request) {
        ProblemDetail pd = ProblemDetail.forStatus(500);
        pd.setTitle("Internal Server Error");
        pd.setDetail("服务器内部错误");
        pd.setProperty("code", ErrorCodes.INTERNAL_ERROR);
        pd.setProperty("requestId", RequestIdFilter.getRequestId(request));
        return ResponseEntity.status(500)
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .body(pd);
    }
}
