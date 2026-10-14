package com.shop.platform.infra.web;

import com.shop.platform.common.ValidationRules;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.Path;
import jakarta.validation.metadata.ConstraintDescriptor;
import java.lang.reflect.Field;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.validation.BindingResult;
import org.springframework.validation.FieldError;

/**
 * 把 jakarta 校验的失败翻译成 422 响应里的字段级明细 {@code [{field, message, rule, min?, max?}]}。
 *
 * <p>为什么多带一个 {@code rule}：过去这里只出 {@code message}（annotation 上那句成品中文），前端要本地化
 * 就只能显示中文或者自己猜。现在多带「违反了哪条规则 + 边界是多少」，**那句话由前端 catalog 按自己的语言出**
 * （规则名的唯一出口是 {@link ValidationRules}，前端那份镜像在 packages/common）。
 * {@code message} 仍然留着，但只进日志与排障——UI 不再从它取句子（词表覆盖满后未知 rule 出按 locale 的通用校验句，
 * 显示后端成品中文就是往非中文界面漏语种）。
 *
 * <p>边界值从注解读（{@code @Size(max=30)} → {@code max: 30}），不靠 rejectedValue 反推——后者只知道
 * 「超了」，不知道「超到几」。读注解要求拿得到被校验对象（{@link BindingResult} 侧）或约束描述
 * （{@link ConstraintViolation} 侧）；两者都拿不到时（理论上不会，因为这两条出口都由 Spring 喂的上下文产生）
 * 就只出 rule 不出边界。
 *
 * <p>独立成一个类而不是塞进 {@code GlobalExceptionHandler}：规则推导要能不起 Spring 直接单测
 * （对着一个 fixture DTO 跑一遍 {@code Validator}，逐条断言 rule 与边界）。
 */
final class FieldValidationErrors {

    private FieldValidationErrors() {}

    /** @Valid @RequestBody 那一路：字段名与注解都要从绑定结果里读 */
    static List<Map<String, Object>> from(BindingResult bindingResult) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (FieldError fe : bindingResult.getFieldErrors()) {
            out.add(entry(bindingResult, fe));
        }
        return out;
    }

    /** @Validated @RequestParam 那一路：约束描述就在 violation 里，字段名是属性路径 */
    static List<Map<String, Object>> from(Iterable<ConstraintViolation<?>> violations) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (ConstraintViolation<?> v : violations) {
            out.add(entry(v));
        }
        return out;
    }

    // ---------------------------------------------------------------- @RequestBody

    private static Map<String, Object> entry(BindingResult bindingResult, FieldError fe) {
        Map<String, Object> e = base(fe.getField(), fe.getDefaultMessage());
        Object rejected = fe.getRejectedValue();
        String code = fe.getCode();
        // 码位为 null 的 FieldError 只在手工构造的绑定结果里出现（Spring 自己不会）。这里必须兜住：
        // 异常处理器自己抛 NPE = 该报 422 的请求变成 500，比少一条 rule 糟得多
        if (code == null) return e;
        switch (code) {
            case "NotNull", "NotBlank", "NotEmpty" -> e.put("rule", ValidationRules.REQUIRED);
            case "Pattern" -> e.put("rule", ValidationRules.PATTERN);
            case "Size" -> size(e, rejected, annotation(bindingResult, fe, jakarta.validation.constraints.Size.class));
            case "Min", "DecimalMin" ->
                min(
                        e,
                        annotation(bindingResult, fe, jakarta.validation.constraints.Min.class),
                        annotation(bindingResult, fe, jakarta.validation.constraints.DecimalMin.class));
            case "Max", "DecimalMax" ->
                max(
                        e,
                        annotation(bindingResult, fe, jakarta.validation.constraints.Max.class),
                        annotation(bindingResult, fe, jakarta.validation.constraints.DecimalMax.class));
            default -> {
                // 词表里还没有的约束（jakarta 新增、或某模块自定义注解）：宁可只留 message，
                // 也不猜一个 rule 出去——前端拿到不认识的 rule 会退回 message，而错的 rule 会说错话
            }
        }
        return e;
    }

    private static void size(Map<String, Object> e, Object rejected, jakarta.validation.constraints.Size a) {
        if (a == null || !(rejected instanceof CharSequence s)) return;
        int len = s.length();
        if (a.min() > 0 && len < a.min()) {
            e.put("rule", ValidationRules.MIN_LENGTH);
            e.put("min", a.min());
        } else if (a.max() != Integer.MAX_VALUE && len > a.max()) {
            e.put("rule", ValidationRules.MAX_LENGTH);
            e.put("max", a.max());
        }
    }

    private static void min(
            Map<String, Object> e, jakarta.validation.constraints.Min a, jakarta.validation.constraints.DecimalMin b) {
        Object bound = a != null ? (Object) a.value() : b != null ? new BigDecimal(b.value()) : null;
        if (bound == null) return;
        e.put("rule", ValidationRules.MIN);
        e.put("min", bound);
    }

    private static void max(
            Map<String, Object> e, jakarta.validation.constraints.Max a, jakarta.validation.constraints.DecimalMax b) {
        Object bound = a != null ? (Object) a.value() : b != null ? new BigDecimal(b.value()) : null;
        if (bound == null) return;
        e.put("rule", ValidationRules.MAX);
        e.put("max", bound);
    }

    /**
     * 沿属性路径找到那个字段上的注解：{@code items[0].quantity} 与 {@code nested.inner} 都要能走通。
     *
     * <p>逐段下钻而不是只取最后一段：只取最后一段的话，嵌套字段的注解读不到（根对象上没有那个字段），
     * 于是嵌套里的每条 422 都只剩一句中文——那正是这条通道要消灭的东西。
     */
    private static <A extends java.lang.annotation.Annotation> A annotation(
            BindingResult br, FieldError fe, Class<A> type) {
        Object target = br.getTarget();
        if (target == null) return null;
        List<String> path = segments(fe.getField());
        Object owner = target;
        Class<?> ownerType = target.getClass();
        for (int i = 0; i < path.size(); i++) {
            Field f = declaredField(ownerType, path.get(i));
            if (f == null) return null;
            A found = f.getAnnotation(type);
            if (found != null) return found;
            // 只有**中间段**才下钻（它是个 @Valid 的嵌套对象）；最后一段是这次被判无效的那个字段，
            // 它的值住在嵌套对象里而不是根对象上——去读它会抛 IllegalArgumentException，
            // 而异常处理器自己抛 = 该报 422 的请求变成 500
            if (i == path.size() - 1) return null;
            Object next = read(owner, f);
            if (next == null) return null;
            owner = next;
            ownerType = next.getClass();
        }
        return null;
    }

    private static Field declaredField(Class<?> owner, String name) {
        for (Class<?> c = owner; c != null && c != Object.class; c = c.getSuperclass()) {
            try {
                Field f = c.getDeclaredField(name);
                f.setAccessible(true);
                return f;
            } catch (NoSuchFieldException ignored) {
                // 走父类
            }
        }
        return null;
    }

    private static Object read(Object owner, Field f) {
        try {
            return f.get(owner);
        } catch (IllegalAccessException | IllegalArgumentException e) {
            return null;
        }
    }

    /** {@code items[0].quantity} → {@code [items, quantity]}；数组下标不是字段，跳过 */
    private static List<String> segments(String path) {
        return java.util.Arrays.stream(path.split("\\."))
                .map(seg -> {
                    int bracket = seg.indexOf('[');
                    return bracket < 0 ? seg : seg.substring(0, bracket);
                })
                .filter(seg -> !seg.isEmpty())
                .toList();
    }

    // ---------------------------------------------------------------- @RequestParam

    private static Map<String, Object> entry(ConstraintViolation<?> v) {
        Map<String, Object> e = base(pathOf(v), v.getMessage());
        Object rejected = v.getInvalidValue();
        ConstraintDescriptor<?> descriptor = v.getConstraintDescriptor();
        // 同 entry(BindingResult, …)：descriptor 缺失时只留 field/message。
        // 异常处理器自己 NPE = 该报 422 的请求变成 500，比少一条 rule 糟得多
        if (descriptor == null || descriptor.getAnnotation() == null) return e;
        switch (descriptor.getAnnotation().annotationType().getSimpleName()) {
            case "NotNull", "NotBlank", "NotEmpty" -> e.put("rule", ValidationRules.REQUIRED);
            case "Pattern" -> e.put("rule", ValidationRules.PATTERN);
            case "Size" -> {
                var d = descriptor;
                long min = num(d.getAttributes().get("min"), 0L);
                long max = num(d.getAttributes().get("max"), Long.MAX_VALUE);
                if (rejected instanceof CharSequence s && s.length() < min) {
                    e.put("rule", ValidationRules.MIN_LENGTH);
                    e.put("min", min);
                } else if (rejected instanceof CharSequence s && s.length() > max) {
                    e.put("rule", ValidationRules.MAX_LENGTH);
                    e.put("max", max);
                }
            }
            case "Min", "DecimalMin" -> bound(e, v, ValidationRules.MIN, "min");
            case "Max", "DecimalMax" -> bound(e, v, ValidationRules.MAX, "max");
            default -> {
                // 同上：词表外的约束只留 message
            }
        }
        return e;
    }

    // ---------------------------------------------------------------- 共用

    private static Map<String, Object> base(String field, String message) {
        Map<String, Object> e = new LinkedHashMap<>();
        e.put("field", field);
        e.put("message", message);
        return e;
    }

    /** {@code items[0].quantity} → {@code quantity}（Spring 的属性路径里数组下标与嵌套用这两种写法） */
    private static String lastSegment(String field) {
        int cut = Math.max(field.lastIndexOf('.'), field.lastIndexOf('['));
        if (cut < 0) return field;
        String tail = field.substring(cut + 1);
        return tail.endsWith("]") ? tail.substring(0, tail.indexOf('[')) : tail;
    }

    /**
     * {@code search.q} → {@code q}：violation 的属性路径只留最后一段，与表单/DTO 的字段名对得上
     * （与 Spring 绑定错误里那条路径同一份形状）。路径取 {@code toString()} 而不是逐个 Path.Node：
     * 前者正是 Spring 拼给前端的那串点号路径。
     */
    private static String pathOf(ConstraintViolation<?> v) {
        Path path = v.getPropertyPath();
        if (path == null) return "";
        return lastSegment(path.toString());
    }

    /** 注解读出来的上下限是 {@code Object}（{@code @Size} 给 Integer、{@code @DecimalMin} 给 Double） */
    private static long num(Object value, long fallback) {
        return value instanceof Number n ? n.longValue() : fallback;
    }

    /**
     * 数值边界出成 **JSON 数字**，三种注解一个类型：{@code @Min} 给 Long、{@code @DecimalMin} 在
     * Jakarta Validation 3.1 里给的是 {@code String}（注解上写的是 {@code "3.00"}），
     * 混着出等于让前端判断「这个数字是 number 还是 string」。字符串那种解析成 {@link BigDecimal}，
     * 落成几位小数由序列化决定（前端只拿到一个数，怎么显示是它的事）。
     */
    private static void bound(Map<String, Object> e, ConstraintViolation<?> v, String rule, String key) {
        Object raw = v.getConstraintDescriptor().getAttributes().get("value");
        Object bound = raw instanceof String s ? new BigDecimal(s) : raw;
        if (bound == null) return;
        e.put("rule", rule);
        e.put(key, bound);
    }
}
