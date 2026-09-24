package com.shop.platform.infra.web;

import com.shop.platform.common.BusinessException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.ConstraintViolationException;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
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
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

@RestControllerAdvice
@Slf4j
@RequiredArgsConstructor
public class GlobalExceptionHandler {

    /**
     * 回显给客户端的请求参数值截断宽度：类型不匹配的 value 是客户端可控的任意长串，原样写进 400 detail
     * 等于给日志膨胀和反射型信息泄露开门。判断越界与下刀必须是同一个数——写成两个字面量后，一旦只改其一，
     * 「阈值小于下刀位置」那侧会让 {@code substring} 越界抛 {@code StringIndexOutOfBoundsException}，
     * 于是这个 handler 自己落进兜底 500：一个非法参数换来一条堆栈。
     */
    private static final int ECHOED_VALUE_MAX = 100;

    private final ClientIp clientIp;

    @ExceptionHandler(BusinessException.class)
    public ResponseEntity<ProblemDetail> handleBusiness(BusinessException ex) {
        ProblemDetail pd = problem(HttpStatus.valueOf(ex.getHttpStatus()), ex.getDetail());
        if (ex.getCode() != null) {
            pd.setProperty("code", ex.getCode());
        }
        List<Map<String, String>> errors = ex.getErrors();
        if (errors != null && !errors.isEmpty()) {
            pd.setProperty("errors", errors);
        }
        return noStore(pd);
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ProblemDetail> handleValidation(
            MethodArgumentNotValidException ex, HttpServletRequest request) {
        List<Map<String, String>> errors = ex.getBindingResult().getFieldErrors().stream()
                .map(fe -> Map.of("field", fe.getField(), "message", fe.getDefaultMessage()))
                .toList();

        // ERR-05: 日志精确到字段，不含实际值
        log.warn("参数校验失败: {} 个字段错误, path={}, ip={}", errors.size(), request.getRequestURI(), clientIp.of(request));
        return noStore(unprocessable(errors));
    }

    @ExceptionHandler(ConstraintViolationException.class)
    public ResponseEntity<ProblemDetail> handleConstraintViolation(ConstraintViolationException ex) {
        // @RequestParam 上的 jakarta 约束（@Validated 触发），与 @RequestBody 的 422 + errors 同一契约
        List<Map<String, String>> errors = ex.getConstraintViolations().stream()
                .map(cv -> Map.of("field", cv.getPropertyPath().toString(), "message", cv.getMessage()))
                .toList();
        return noStore(unprocessable(errors));
    }

    @ExceptionHandler(MissingServletRequestParameterException.class)
    public ResponseEntity<ProblemDetail> handleMissingParam(MissingServletRequestParameterException ex) {
        // 必填查询参数缺失 → 400，不能落进兜底的 500
        return noStore(problem(HttpStatus.BAD_REQUEST, "缺少请求参数: " + ex.getParameterName()));
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<ProblemDetail> handleMessageNotReadable(HttpMessageNotReadableException ex) {
        // ERR-03: JSON 格式非法、未知字段等解析失败 → 400
        return noStore(problem(HttpStatus.BAD_REQUEST, "请求体格式错误"));
    }

    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ResponseEntity<ProblemDetail> handleTypeMismatch(MethodArgumentTypeMismatchException ex) {
        // @RequestParam 类型转换失败（枚举值非法如 target=NOT_A_STATUS、非 UUID 的路径参数）→ 400，
        // 不能落进兜底的 500。与相邻两个 400 handler 同形状：只有 detail，不带 code / errors
        Object value = ex.getValue();
        String shown = value == null ? "null" : String.valueOf(value);
        if (shown.length() > 100) {
            shown = shown.substring(0, 100) + "…";
        }
        return noStore(problem(HttpStatus.BAD_REQUEST, "请求参数不合法: " + ex.getName() + "=" + shown));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ProblemDetail> handleGeneral(Exception ex) {
        log.error("未捕获异常", ex);
        return noStore(problem(HttpStatus.INTERNAL_SERVER_ERROR, "服务器内部错误"));
    }

    // 组装辅助
    /** 统一 ProblemDetail 组装：title 取状态码 reason phrase，requestId 从 MDC 带出 */
    private static ProblemDetail problem(HttpStatus status, String detail) {
        ProblemDetail pd = ProblemDetail.forStatus(status);
        pd.setTitle(status.getReasonPhrase());
        pd.setDetail(detail);
        pd.setProperty("requestId", MDC.get("trace_id"));
        return pd;
    }

    /** 字段级校验失败统一出口：422 + errors 明细（@RequestBody 与 @RequestParam 约束共用） */
    private static ProblemDetail unprocessable(List<Map<String, String>> errors) {
        ProblemDetail pd = problem(HttpStatus.UNPROCESSABLE_CONTENT, "输入校验失败（" + errors.size() + " 个字段错误）");
        pd.setProperty("errors", errors);
        return pd;
    }

    /** 所有 handler 共用响应契约：no-store 防止错误响应被缓存 */
    private static ResponseEntity<ProblemDetail> noStore(ProblemDetail pd) {
        return ResponseEntity.status(pd.getStatus())
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .body(pd);
    }
}
