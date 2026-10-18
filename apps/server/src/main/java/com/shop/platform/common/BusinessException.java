package com.shop.platform.common;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import lombok.Getter;

/** 业务异常，由 GlobalExceptionHandler 自动转为 RFC 9457 ProblemDetail。 */
@Getter
public class BusinessException extends RuntimeException {

    private final int httpStatus;

    /** 只在前端无法仅通过 HTTP status 区分时传 code，见 docs/error-codes.md */
    private final String code;

    private final String detail;

    /**
     * 字段级错误列表，格式：[{ "field": "phone", "message": "手机号错误" }]，可选再带
     * "value"（那条规则实际作用到的数据，如命中的违禁词）。 主要用于 service 层手动校验后传参，或配合
     * MethodArgumentNotValidException 使用。
     */
    private final transient List<Map<String, String>> errors;

    /**
     * 那条错误的结构化上下文（ProblemDetail 扩展属性 {@code params}），可选：把「必须原样给用户、
     * 且只有后端知道」的值当数据交出去，而不是拼进 detail 那句话里。首个使用者是两条地址上限码
     * （上限 20 / 200 住在后端常量里，前端没有对边，catalog 写死就是一个会谎报的字面量）。
     *
     * <p>与 {@code errors} 的分工：{@code errors} 定位**字段**（按 field 标红输入框），{@code params}
     * 定位**这条错误的原因**（没有对应输入框可标红）。值只放标量，含用户输入或敏感值的不进这里。
     * 形状由契约的 {@code ApiProblem.params} 声明（值是三态标量），取值不在；
     * 改一个槽位名或它的值都不需要 {@code pnpm sdk:gen}。
     */
    private final transient Map<String, Object> params;

    // 核心构造器
    public BusinessException(int httpStatus, String code, String detail) {
        this(httpStatus, code, detail, null);
    }

    public BusinessException(int httpStatus, String detail) {
        this(httpStatus, null, detail, null);
    }

    public BusinessException(int httpStatus, String code, String detail, List<Map<String, String>> errors) {
        this(httpStatus, code, detail, errors, null);
    }

    public BusinessException(
            int httpStatus, String code, String detail, List<Map<String, String>> errors, Map<String, ?> params) {
        super(detail);
        this.httpStatus = httpStatus;
        this.code = code;
        this.detail = detail;
        this.errors = errors;
        this.params = params == null ? null : new LinkedHashMap<>(params);
    }

    // 常用工厂方法
    public static BusinessException notFound(String detail) {
        return new BusinessException(404, detail);
    }

    public static BusinessException conflict(String detail) {
        return new BusinessException(409, detail);
    }

    public static BusinessException conflict(String code, String detail) {
        return new BusinessException(409, code, detail);
    }

    /**
     * 409 + 字段级明细：撞唯一索引（用户填的值已被占用）时把「哪个框」作为数据交出去，
     * 前端据此标红输入框——与 {@code badRequest(code, detail, errors)} 同一条 errors 通道。
     *
     * <p>状态码仍是 409（撞唯一索引是资源状态冲突，RFC 9110），标红靠的是 errors 那一格、与状态码无关
     * （前端 {@code serverFieldErrors} 只读 errors[]）。用户没有对应输入框的撞键（按钮/开关）不带 errors。
     */
    public static BusinessException conflict(String code, String detail, List<Map<String, String>> errors) {
        return new BusinessException(409, code, detail, errors);
    }

    public static BusinessException unauthorized(String detail) {
        return new BusinessException(401, detail);
    }

    public static BusinessException unauthorized(String code, String detail) {
        return new BusinessException(401, code, detail);
    }

    public static BusinessException forbidden(String detail) {
        return new BusinessException(403, detail);
    }

    /** 403 + 业务 code（禁用、权限不足那类），见 docs/error-codes.md */
    public static BusinessException forbidden(String code, String detail) {
        return new BusinessException(403, code, detail);
    }

    public static BusinessException badRequest(String detail) {
        return new BusinessException(400, detail);
    }

    /** code 为可选参数，只有需要前端区分时才传 */
    public static BusinessException badRequest(String code, String detail) {
        return new BusinessException(400, code, detail);
    }

    /**
     * 400 + 字段级明细：给用户看的句子之外，还要把「哪个字段、卡在哪条规则上的那个值」作为数据交出去
     * （{@code errors[].field} 用 DTO/表单的机器字段名，不用中文标签）。
     *
     * <p>只有「一句话装不下、前端要按字段定位」的那几个码走这条路（见 docs/error-codes.md 的 COM-01）。
     * 用工厂而不是就地 new，是因为 400 的状态码只有从工厂签名里才认得出来（GEN-62）。
     */
    public static BusinessException badRequest(String code, String detail, List<Map<String, String>> errors) {
        return new BusinessException(400, code, detail, errors);
    }

    /**
     * 400 + 结构化上下文：与 {@link #badRequest(String, String, List)} 同一个位置参数个数，靠形参类型区分，
     * 所以另起名字而不是加一个重载——{@code Map.of("limit", 20)} 的类型是 {@code Map<String, Integer>}，
     * 与 {@code List} 重载并不冲突，但两个只差位置的 List/Map 重载读起来分不出该传哪个。
     *
     * <p>用法与 {@code errors} 同一条纪律：detail 仍然写完整中文句子（日志与中文界面兜底靠它），
     * 但那句话里的关键数字不再由前端解析——它作为 {@code limit} 出一次，前端用它填 catalog 句子的
     * <code>{limit}</code> 槽位（见 docs/error-codes.md 的参数通道）。
     */
    public static BusinessException badRequestWithParams(String code, String detail, Map<String, ?> params) {
        return new BusinessException(400, code, detail, null, params);
    }

    /**
     * 409 + 结构化上下文：冲突的对象需要前端据此做恢复动作时（如「该订单已有待发货的发货单」的
     * 包裹 id / 承运商 / 运单号），把定位用的值当数据出；detail 仍是完整句子（日志与兜底）。
     * 与 {@link #badRequestWithParams} 同一纪律：只放标量；code 位传 null 是设计——本类没有对应码，
     * 前端按 params 的有无分叉，不新增词表。
     */
    public static BusinessException conflictWithParams(String code, String detail, Map<String, ?> params) {
        return new BusinessException(409, code, detail, null, params);
    }

    public static BusinessException rateLimited(String detail) {
        return new BusinessException(429, detail);
    }

    public static BusinessException rateLimited(String code, String detail) {
        return new BusinessException(429, code, detail);
    }

    /**
     * 413 请求体过大。唯一出口是 {@code infra.web.RequestBodySizeFilter}（SEC-04 的 1MB 闸门，
     * 在 Jackson 解析之前掐掉）。
     *
     * <p><b>刻意不给码</b>：它是 HTTP 状态码本身的复述（判据「code 不是 HTTP status 的复述」），
     * 前端没有按它分叉的动作，用户可见文案由状态码那条通道出（`appKit.error.payloadTooLarge`）。
     * 此前这个响应由过滤器自己 setStatus + getWriter 手搓，用的码是小写点分的
     * {@code request.too_large}——那不在任何一份词表里，前端永远命中不了。
     */
    public static BusinessException payloadTooLarge(String detail) {
        return new BusinessException(413, detail);
    }

    public static BusinessException gone(String code, String detail) {
        return new BusinessException(410, code, detail);
    }
}
