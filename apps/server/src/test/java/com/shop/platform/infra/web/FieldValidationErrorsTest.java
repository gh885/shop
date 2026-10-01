package com.shop.platform.infra.web;

import static org.assertj.core.api.Assertions.assertThat;

import jakarta.validation.ConstraintViolation;
import jakarta.validation.Valid;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.ValidatorFactory;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.validation.BeanPropertyBindingResult;
import org.springframework.validation.BindingResult;

/**
 * 422 字段级明细的 {@code rule} 与边界推导（{@link FieldValidationErrors}）。
 *
 * <p>为什么单独测它：这一层是「注解 → 对外协议」的翻译，翻译错了两边都不会红——后端那句
 * {@code message} 仍然正确、前端只是拿不到可本地化的信息，于是错误静默地退回显示中文。
 * 不起 Spring，直接拿真 {@code Validator} 跑一个 fixture DTO，逐条断言 rule 与边界。
 */
class FieldValidationErrorsTest {

    private static ValidatorFactory factory;
    private static Validator validator;

    @BeforeAll
    static void setUpFactory() {
        factory = Validation.buildDefaultValidatorFactory();
        validator = factory.getValidator();
    }

    @AfterAll
    static void closeFactory() {
        factory.close();
    }

    /** fixture：每个字段只违反一条约束，便于逐条断言 */
    static class Dto {
        @NotBlank(message = "标题不能为空")
        String blank = "";

        @Size(min = 2, max = 4, message = "长度需在 2~4")
        String tooLong = "六个字abc";

        @Pattern(regexp = "^1[3-9]\\d{9}$", message = "手机号格式错误")
        String badPhone = "123";

        @Min(value = 1, message = "数量至少 1")
        Integer zero = 0;

        @DecimalMax(value = "99.50", message = "金额超限")
        String price = "100.00";

        /** 词表外的约束：只留 field/message，不猜 rule */
        @jakarta.validation.constraints.Email(message = "邮箱格式错误")
        String badEmail = "not-an-email";

        @Valid
        Nested nested = new Nested();

        @Valid
        RecordTier tier = new RecordTier(0);
    }

    /** record 里的嵌套（真实的运费模板 DTO 就是这个形状：record 组件 + 嵌套 record） */
    record RecordTier(@Min(value = 1, message = "首件至少 1") Integer firstQuantity) {}

    static class Nested {
        @Size(max = 3, message = "子字段过长")
        String inner = "太长了的子字段";
    }

    private static List<Map<String, Object>> entriesOf(Object target) {
        BeanPropertyBindingResult br = new BeanPropertyBindingResult(target, "dto");
        // 手工转成 FieldError：BeanPropertyBindingResult 不收 jakarta 的 ConstraintViolation（两个类型体系的端口不同），
        // 而 FieldValidationErrors.from(BindingResult) 读的就是它——这条转换只存在于测试夹具里
        for (ConstraintViolation<?> v : validator.validate(target)) {
            br.addError(new org.springframework.validation.FieldError(
                    "dto",
                    v.getPropertyPath().toString(),
                    v.getInvalidValue(),
                    false,
                    new String[] {
                        v.getConstraintDescriptor()
                                .getAnnotation()
                                .annotationType()
                                .getSimpleName()
                    },
                    null,
                    v.getMessage()));
        }
        return FieldValidationErrors.from((BindingResult) br);
    }

    private static Map<String, Object> entryFor(List<Map<String, Object>> entries, String field) {
        return entries.stream()
                .filter(e -> field.equals(e.get("field")))
                .findFirst()
                .orElseThrow(() -> new AssertionError("没有 " + field + " 的明细：" + entries));
    }

    @Test
    void 每条约束翻成对应的rule与边界() {
        List<Map<String, Object>> entries = entriesOf(new Dto());

        assertThat(entryFor(entries, "blank")).containsEntry("rule", "REQUIRED").containsEntry("message", "标题不能为空");
        assertThat(entryFor(entries, "tooLong")).containsEntry("rule", "MAX_LENGTH");
        assertThat(entryFor(entries, "tooLong").get("max")).isEqualTo(4);
        assertThat(entryFor(entries, "badPhone")).containsEntry("rule", "PATTERN");
        assertThat(entryFor(entries, "zero")).containsEntry("rule", "MIN").containsEntry("min", 1L);
        // Integer/Long 的差别到 JSON 里就没了（都出成 4），所以断言的是「一个等于 4 的数」
        // 小数边界出 JSON 数字（@DecimalMax 的值在 Jakarta 3.1 里本就是 String 字面量，这里解析成 BigDecimal）
        assertThat(entryFor(entries, "price")).containsEntry("rule", "MAX");
        assertThat((BigDecimal) entryFor(entries, "price").get("max")).isEqualByComparingTo("99.50");
    }

    @Test
    void 词表外的约束只留field与message不猜rule() {
        Map<String, Object> email = entryFor(entriesOf(new Dto()), "badEmail");

        assertThat(email).containsEntry("message", "邮箱格式错误");
        assertThat(email).doesNotContainKey("rule");
    }

    /**
     * record 里的嵌套字段（`defaultRule.firstQuantity` 那个形状）：最后一段的字段住在嵌套对象上，
     * 去根对象上读它会抛 IllegalArgumentException，而异常处理器自己抛 = 422 变 500。
     */
    @Test
    void record嵌套里的rule照样出() {
        assertThat(entryFor(entriesOf(new Dto()), "tier.firstQuantity"))
                .containsEntry("rule", "MIN")
                .containsEntry("message", "首件至少 1");
    }

    @Test
    void 嵌套字段的rule照样出() {
        assertThat(entryFor(entriesOf(new Dto()), "nested.inner"))
                .containsEntry("rule", "MAX_LENGTH")
                .containsEntry("max", 3);
    }

    /** @RequestParam 那一路：约束描述在 violation 里，边界直接从描述的属性读 */
    @Test
    void 请求参数那一路从约束描述读边界() throws NoSuchMethodException {
        var method = ExecutablesHolder.class.getDeclaredMethod("paramMethod", String.class);
        method.setAccessible(true);
        ConstraintViolation<?> v = validator
                .forExecutables()
                .validateParameters(new ExecutablesHolder(), method, new Object[] {"abcdefg"})
                .iterator()
                .next();

        List<Map<String, Object>> entries = FieldValidationErrors.from(List.of(v));

        assertThat(entries).singleElement().satisfies(e -> {
            assertThat(e).containsEntry("field", "q").containsEntry("rule", "MAX_LENGTH");
            assertThat(e.get("max")).isEqualTo(4L);
        });
    }

    @SuppressWarnings("unused")
    static class ExecutablesHolder {
        // 约束挂在方法参数上，@RequestParam 那一路（@Validated）校验的就是它
        void paramMethod(@Size(max = 4, message = "最长 4 个字") String q) {}
    }
}
