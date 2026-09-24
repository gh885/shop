package com.shop.platform.common;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.catchThrowableOfType;

import java.util.Optional;
import org.junit.jupiter.api.Test;

/** service 层校验收口：isTrue / notNull / present / owned / enumFilter。失败即抛对应状态码的业务异常。 */
class ValidateTest {

    private enum Color {
        RED
    }

    /** 归属闸门的最小样本行：只有一列 owner，够测「谁的」这件事 */
    private record Resource(String owner, String name) {}

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

    @Test
    void owned_归属成立_静默通过() {
        Validate.owned(true, "订单不存在");

        // 闸门放行时把行原样交回，调用点不必再取一次
        assertThat(Validate.requireOwned(new Resource("u1", "a"), Resource::owner, "u1", "资源不存在")
                        .name())
                .isEqualTo("a");
        assertThat(Validate.presentOwned(Optional.of(new Resource("u1", "b")), Resource::owner, "u1", "资源不存在")
                        .name())
                .isEqualTo("b");
    }

    /**
     * 归属闸门唯一要钉死的事：行不存在与行不属于你，回答<b>一模一样</b>（同状态码同话术）。
     *
     * <p>两侧都断言才有意义——只测「越权给 404」的话，把 detail 写成「资源不属于你」或状态码写成 403 都能过，
     * 而那正是可枚举化的开始：响应有差别，脚本就能拿它当存在性探针。
     */
    @Test
    void requireOwned_缺席与越权同一句话_状态码不可区分() {
        BusinessException absent = catchThrowableOfType(
                () -> Validate.requireOwned((Resource) null, Resource::owner, "u1", "资源不存在"), BusinessException.class);
        BusinessException foreign = catchThrowableOfType(
                () -> Validate.requireOwned(new Resource("u2", "x"), Resource::owner, "u1", "资源不存在"),
                BusinessException.class);
        BusinessException optionalAbsent = catchThrowableOfType(
                () -> Validate.presentOwned(Optional.empty(), Resource::owner, "u1", "资源不存在"), BusinessException.class);

        assertThat(absent.getHttpStatus()).isEqualTo(404).isEqualTo(foreign.getHttpStatus());
        assertThat(absent.getDetail()).isEqualTo("资源不存在").isEqualTo(foreign.getDetail());
        assertThat(optionalAbsent.getHttpStatus()).isEqualTo(404);
        assertThat(optionalAbsent.getDetail()).isEqualTo(absent.getDetail());
    }

    @Test
    void owned_判定式形式_越权按不存在处理() {
        assertThatThrownBy(() -> Validate.owned(false, "订单不存在")).isInstanceOfSatisfying(BusinessException.class, ex -> {
            assertThat(ex.getHttpStatus()).isEqualTo(404);
            assertThat(ex.getDetail()).isEqualTo("订单不存在");
        });
    }
}
