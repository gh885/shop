package com.shop.platform.infra.web;

import com.shop.platform.common.BusinessException;
import com.shop.platform.common.ErrorCodes;
import com.shop.platform.infra.security.ForbiddenException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.ConstraintViolationException;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

/**
 * HTTP 边界的唯一翻译点。对外形状是 RFC 9457 {@link ProblemDetail}，扩展属性 {@code code} / {@code errors} /
 * {@code params} / {@code requestId} 就是前端契约。
 *
 * <p>这个类从主分支原样继承，改的只有两处：日志里不带客户端 IP（{@code ClientIp} 依赖的配置还没重建），
 * MDC 的链路键名跟着当前的过滤器走。
 *
 * <p>几条不是风格问题，是踩过的：
 *
 * <ul>
 *   <li>本类<b>不继承</b> {@code ResponseEntityExceptionHandler}，所以框架级 4xx 必须逐个显式接住。
 *       漏一个（415、405）就会落进 {@code Exception} 兜底变成 500——客户端传错 Content-Type，
 *       服务端把自己的锅背成"内部错误"。
 *   <li>回显给客户端的参数值要截断。类型不匹配的 value 是客户端可控的任意长串，原样写进 detail
 *       等于给日志膨胀和反射型信息泄露开门。
 *   <li>所有错误响应带 {@code Cache-Control: no-store}，防止中间层缓存错误。
 * </ul>
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    /** 回显值截断宽度。判越界与下刀必须是同一个数，否则 substring 会自己抛越界，变成 500。 */
    private static final int ECHOED_VALUE_MAX = 100;

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
        Map<String, Object> params = ex.getParams();
        if (params != null && !params.isEmpty()) {
            pd.setProperty("params", params);
        }
        return noStore(pd);
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ProblemDetail> handleValidation(
            MethodArgumentNotValidException ex, HttpServletRequest request) {
        List<Map<String, Object>> errors = FieldValidationErrors.from(ex.getBindingResult());
        log.warn("参数校验失败: {} 个字段错误, path={}", errors.size(), request.getRequestURI());
        return noStore(unprocessable(errors));
    }

    @ExceptionHandler(ConstraintViolationException.class)
    public ResponseEntity<ProblemDetail> handleConstraintViolation(ConstraintViolationException ex) {
        return noStore(unprocessable(FieldValidationErrors.from(ex.getConstraintViolations())));
    }

    @ExceptionHandler(MissingServletRequestParameterException.class)
    public ResponseEntity<ProblemDetail> handleMissingParam(MissingServletRequestParameterException ex) {
        return noStore(problem(HttpStatus.BAD_REQUEST, "缺少请求参数: " + ex.getParameterName()));
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<ProblemDetail> handleMessageNotReadable(HttpMessageNotReadableException ex) {
        return noStore(problem(HttpStatus.BAD_REQUEST, "请求体格式错误"));
    }

    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ResponseEntity<ProblemDetail> handleTypeMismatch(MethodArgumentTypeMismatchException ex) {
        Object value = ex.getValue();
        String shown = value == null ? "null" : String.valueOf(value);
        if (shown.length() > ECHOED_VALUE_MAX) {
            shown = shown.substring(0, ECHOED_VALUE_MAX) + "…";
        }
        return noStore(problem(HttpStatus.BAD_REQUEST, "请求参数不合法: " + ex.getName() + "=" + shown));
    }

    @ExceptionHandler(HttpMediaTypeNotSupportedException.class)
    public ResponseEntity<ProblemDetail> handleUnsupportedMediaType(HttpMediaTypeNotSupportedException ex) {
        return noStore(problem(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "请求的 Content-Type 不受支持"));
    }

    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    public ResponseEntity<ProblemDetail> handleMethodNotSupported(HttpRequestMethodNotSupportedException ex) {
        ProblemDetail pd = problem(HttpStatus.METHOD_NOT_ALLOWED, "请求方法不受支持");
        return ResponseEntity.status(pd.getStatus())
                .headers(ex.getHeaders())
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .body(pd);
    }

    @ExceptionHandler(NoResourceFoundException.class)
    public ResponseEntity<ProblemDetail> handleNoResource(HttpServletRequest request) {
        log.warn("路由不存在: {} {}", request.getMethod(), request.getRequestURI());
        return noStore(problem(HttpStatus.NOT_FOUND, "接口不存在"));
    }

    /**
     * 判权失败。**不接这个异常，越权就会变成 500。**
     *
     * <p>{@link ForbiddenException} 是运行时异常，不继承 {@link BusinessException}，
     * 所以它以前一路落进 {@code Exception} 兜底——调用方看到"服务器内部错误"，
     * 既不知道该重新登录还是该放弃，监控上还多了一条假故障。
     *
     * <p>对外只说"没有权限"，不区分"没身份"和"身份不够"：区分等于告诉攻击者
     * 他离成功还差一步还是一百步。差别写日志里。
     */
    @ExceptionHandler(ForbiddenException.class)
    public ResponseEntity<ProblemDetail> handleForbidden(ForbiddenException ex) {
        log.warn("判权失败: {}", ex.getMessage());
        ProblemDetail pd = problem(HttpStatus.FORBIDDEN, "没有操作权限");
        pd.setProperty("code", ErrorCodes.PERMISSION_DENIED);
        return noStore(pd);
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ProblemDetail> handleGeneral(Exception ex) {
        log.error("未捕获异常", ex);
        return noStore(problem(HttpStatus.INTERNAL_SERVER_ERROR, "服务器内部错误"));
    }

    private static ProblemDetail problem(HttpStatus status, String detail) {
        ProblemDetail pd = ProblemDetail.forStatus(status);
        pd.setTitle(status.getReasonPhrase());
        pd.setDetail(detail);
        pd.setProperty("requestId", RequestIdFilter.current());
        return pd;
    }

    private static ProblemDetail unprocessable(List<Map<String, Object>> errors) {
        ProblemDetail pd = problem(HttpStatus.UNPROCESSABLE_CONTENT, "输入校验失败（" + errors.size() + " 个字段错误）");
        pd.setProperty("errors", errors);
        return pd;
    }

    private static ResponseEntity<ProblemDetail> noStore(ProblemDetail pd) {
        return ResponseEntity.status(pd.getStatus())
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .body(pd);
    }
}
