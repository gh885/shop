package com.shop.platform.common;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.Optional;
import org.junit.jupiter.api.Test;

/** service 层校验收口：isTrue / notNull / present / enumFilter。失败即抛对应状态码的业务异常。 */
class ValidateTest {

    private enum Color {
        RED
    }

    @Test
    void enumFilter_空白不过滤_命中给值() {
        assertThat(Validate.enumFilter(Color.class, null, "非法的颜色筛选值")).isNull();
        assertThat(Validate.enumFilter(Color.class, "  ", "非法的颜色筛选值")).isNull();
        assertThat(Validate.enumFilter(Color.class, "RED", "非法的颜色筛选值")).isEqualTo(Color.RED);
    }

    /** 这一格钉的是 500 → 400：筛选值写错是调用方的错，枚举就是合法值表 */
    @Test
    void enumFilter_不在枚举内_400() {
        assertThatThrownBy(() -> Validate.enumFilter(Color.class, "BOGUS", "非法的颜色筛选值"))
                .isInstanceOfSatisfying(BusinessException.class, ex -> assertThat(ex.getHttpStatus())
                        .isEqualTo(400));
    }

    @Test
    void isTrue_条件成立_静默通过() {
        Validate.isTrue(true, "不该抛");
        Validate.isTrue(true, "CODE", "不该抛");
        Validate.isTrue(true, 409, "不该抛");
    }

    @Test
    void isTrue_不成立_400() {
        assertThatThrownBy(() -> Validate.isTrue(false, "库存不足")).isInstanceOfSatisfying(BusinessException.class, ex -> {
            assertThat(ex.getHttpStatus()).isEqualTo(400);
            assertThat(ex.getCode()).isNull();
            assertThat(ex.getDetail()).isEqualTo("库存不足");
        });
    }

    @Test
    void isTrue_带code与自定义状态码() {
        assertThatThrownBy(() -> Validate.isTrue(false, "STATE_CONFLICT", "状态冲突"))
                .isInstanceOfSatisfying(
                        BusinessException.class, ex -> assertThat(ex.getCode()).isEqualTo("STATE_CONFLICT"));

        assertThatThrownBy(() -> Validate.isTrue(false, 409, "越态操作"))
                .isInstanceOfSatisfying(BusinessException.class, ex -> assertThat(ex.getHttpStatus())
                        .isEqualTo(409));
    }

    @Test
    void notNull_存在返回引用本身_缺失404() {
        Object ref = new Object();

        // 返回值支持链式使用：Validate.notNull(x, "...").doSomething()
        assertThat(Validate.notNull(ref, "订单不存在")).isSameAs(ref);

        assertThatThrownBy(() -> Validate.notNull(null, "订单不存在"))
                .isInstanceOfSatisfying(BusinessException.class, ex -> assertThat(ex.getHttpStatus())
                        .isEqualTo(404));
    }

    @Test
    void present_Optional收口() {
        Optional<String> value = Optional.of("ok");

        // 返回值支持链式使用
        assertThat(Validate.present(value, "不存在")).isEqualTo("ok");
        assertThat(Validate.present(Optional.of(1), 400, "参数不可满足")).isEqualTo(1);
    }

    @Test
    void present_空Optional_404与自定义状态码() {
        assertThatThrownBy(() -> Validate.present(Optional.empty(), "店铺不存在"))
                .isInstanceOfSatisfying(BusinessException.class, ex -> assertThat(ex.getHttpStatus())
                        .isEqualTo(404));

        assertThatThrownBy(() -> Validate.present(Optional.empty(), 400, "参数不可满足"))
                .isInstanceOfSatisfying(BusinessException.class, ex -> assertThat(ex.getHttpStatus())
                        .isEqualTo(400));
    }
}
