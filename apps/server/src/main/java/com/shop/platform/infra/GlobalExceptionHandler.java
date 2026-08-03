package com.shop.platform.infra;

import com.shop.platform.common.BusinessException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.ConstraintViolationException;
import java.util.List;
import java.util.Map;
import lombok.extern.slf4j.Slf4j;
import org.slf4j.MDC;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
@Slf4j
public class GlobalExceptionHandler {

    @ExceptionHandler(BusinessException.class)
    public ResponseEntity<ProblemDetail> handleBusiness(BusinessException ex) {
        ProblemDetail pd = ProblemDetail.forStatus(ex.getHttpStatus());
        pd.setTitle(HttpStatus.valueOf(ex.getHttpStatus()).getReasonPhrase());
        pd.setDetail(ex.getDetail());
        if (ex.getCode() != null) {
            pd.setProperty("code", ex.getCode());
        }
        List<Map<String, String>> errors = ex.getErrors();
        if (errors != null && !errors.isEmpty()) {
            pd.setProperty("errors", errors);
        }
        pd.setProperty("requestId", MDC.get("trace_id"));
        return ResponseEntity.status(ex.getHttpStatus())
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .body(pd);
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ProblemDetail> handleValidation(
            MethodArgumentNotValidException ex, HttpServletRequest request) {
        List<Map<String, String>> errors = ex.getBindingResult().getFieldErrors().stream()
                .map(fe -> Map.of("field", fe.getField(), "message", fe.getDefaultMessage()))
                .toList();

        // ERR-05: 日志精确到字段，不含实际值
        String clientIp = request.getRemoteAddr();
        String xfHeader = request.getHeader("X-Forwarded-For");
        if (xfHeader != null && !xfHeader.isEmpty() && !"unknown".equalsIgnoreCase(xfHeader)) {
            clientIp = xfHeader.split(",")[0].trim();
        }
        log.warn("参数校验失败: {} 个字段错误, path={}, ip={}", errors.size(), request.getRequestURI(), clientIp);

        ProblemDetail pd = ProblemDetail.forStatus(422);
        pd.setTitle("Unprocessable Entity");
        pd.setDetail("输入校验失败（" + errors.size() + " 个字段错误）");
        pd.setProperty("requestId", MDC.get("trace_id"));
        pd.setProperty("errors", errors);
        return ResponseEntity.status(422)
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .body(pd);
    }

    @ExceptionHandler(ConstraintViolationException.class)
    public ResponseEntity<ProblemDetail> handleConstraintViolation(ConstraintViolationException ex) {
        // @RequestParam 上的 jakarta 约束（@Validated 触发），与 @RequestBody 的 422 + errors 同一契约
        List<Map<String, String>> errors = ex.getConstraintViolations().stream()
                .map(cv -> Map.of("field", cv.getPropertyPath().toString(), "message", cv.getMessage()))
                .toList();
        ProblemDetail pd = ProblemDetail.forStatus(422);
        pd.setTitle("Unprocessable Entity");
        pd.setDetail("输入校验失败（" + errors.size() + " 个字段错误）");
        pd.setProperty("requestId", MDC.get("trace_id"));
        pd.setProperty("errors", errors);
        return ResponseEntity.status(422)
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .body(pd);
    }

    @ExceptionHandler(MissingServletRequestParameterException.class)
    public ResponseEntity<ProblemDetail> handleMissingParam(MissingServletRequestParameterException ex) {
        // 必填查询参数缺失 → 400，不能落进兜底的 500
        ProblemDetail pd = ProblemDetail.forStatus(400);
        pd.setTitle("Bad Request");
        pd.setDetail("缺少请求参数: " + ex.getParameterName());
        pd.setProperty("requestId", MDC.get("trace_id"));
        return ResponseEntity.status(400)
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .body(pd);
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<ProblemDetail> handleMessageNotReadable(HttpMessageNotReadableException ex) {
        // ERR-03: JSON 格式非法、未知字段等解析失败 → 400
        ProblemDetail pd = ProblemDetail.forStatus(400);
        pd.setTitle("Bad Request");
        pd.setDetail("请求体格式错误");
        pd.setProperty("requestId", MDC.get("trace_id"));
        return ResponseEntity.status(400)
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .body(pd);
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ProblemDetail> handleGeneral(Exception ex) {
        log.error("未捕获异常", ex);
        ProblemDetail pd = ProblemDetail.forStatus(500);
        pd.setTitle("Internal Server Error");
        pd.setDetail("服务器内部错误");
        pd.setProperty("requestId", MDC.get("trace_id"));
        return ResponseEntity.status(500)
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .body(pd);
    }
}
