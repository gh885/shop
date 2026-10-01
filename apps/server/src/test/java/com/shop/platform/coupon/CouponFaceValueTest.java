package com.shop.platform.coupon;

import static org.junit.jupiter.api.Assertions.*;

import com.shop.platform.common.Money;
import com.shop.platform.coupon.model.CouponType;
import com.shop.platform.coupon.service.CouponFaceValue;
import java.math.BigDecimal;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

/**
 * 面值计算的两段封顶（CPN-22 / CPN-66）。无 IO、无状态，纯函数直测——结算预览与真实下单同一条链路。
 *
 * <p>顺序定死的两件事各验一格：第一段是券自己的面值（满减取定值、折扣按比例再对 maxDiscountAmount 取小），
 * 第二段是面值不得超过商品基数。反了会在「折扣额 > 基数」时多减一次。
 */
class CouponFaceValueTest {

    private static Money base(long fen) {
        return Money.cny(fen);
    }

    @Nested
    class 满减券 {
        @Test
        void 面值低于基数_减面值() {
            long discount = CouponFaceValue.discountOf(CouponType.FULL_REDUCTION, 500L, null, null, base(1000));
            assertEquals(500, discount);
        }

        @Test
        void 面值超过基数_第二段封顶到基数() {
            // 券不可找零，超出部分作废（CPN-22）
            long discount = CouponFaceValue.discountOf(CouponType.FULL_REDUCTION, 1500L, null, null, base(1000));
            assertEquals(1000, discount);
        }

        @Test
        void 面值恰等基数_减到基数() {
            long discount = CouponFaceValue.discountOf(CouponType.FULL_REDUCTION, 1000L, null, null, base(1000));
            assertEquals(1000, discount);
        }

        @Test
        void 面值为null_按零处理() {
            // 快照列可空：null 走 nullSafe 归 0，不减钱也不抛
            long discount = CouponFaceValue.discountOf(CouponType.FULL_REDUCTION, null, null, null, base(1000));
            assertEquals(0, discount);
        }

        @Test
        void 满减券忽略折扣封顶列_只看面值与基数() {
            // maxDiscountAmount 只作用在折扣券；满减券带着它也该按满减语义走
            long discount = CouponFaceValue.discountOf(CouponType.FULL_REDUCTION, 1500L, null, 9999L, base(1000));
            assertEquals(1000, discount);
        }
    }

    @Nested
    class 折扣券 {
        @Test
        void 按比例打折_未触顶() {
            // 打 8 折 → 实减 = round(基数 × (1 − 0.8)) = 200
            long discount =
                    CouponFaceValue.discountOf(CouponType.DISCOUNT, null, new BigDecimal("0.8"), 99999L, base(1000));
            assertEquals(200, discount);
        }

        @Test
        void 折额超过封顶_第一段取封顶() {
            // 打 5 折本减 5000，封顶 1000 → 1000
            long discount =
                    CouponFaceValue.discountOf(CouponType.DISCOUNT, null, new BigDecimal("0.5"), 1000L, base(10000));
            assertEquals(1000, discount);
        }

        @Test
        void 无封顶列_按全额折() {
            // maxDiscountAmount 为 null 时跳过第一段封顶
            long discount =
                    CouponFaceValue.discountOf(CouponType.DISCOUNT, null, new BigDecimal("0.5"), null, base(10000));
            assertEquals(5000, discount);
        }

        @Test
        void 折额四舍五入到分_半分进位() {
            // 999 × (1 − 0.85) = 149.85 → HALF_UP → 150
            long discount =
                    CouponFaceValue.discountOf(CouponType.DISCOUNT, null, new BigDecimal("0.85"), null, base(999));
            assertEquals(150, discount);
        }

        @Test
        void 折率为null_视为全额再受封顶收口() {
            // roundedDiscount 对 null 折率返回基数；随后仍要过封顶与基数两道 min
            long discount = CouponFaceValue.discountOf(CouponType.DISCOUNT, null, null, 500L, base(1000));
            assertEquals(500, discount);
        }

        @Test
        void 折后额超过基数_第二段封顶到基数() {
            // 0 折（全免）时 face=基数，min 后仍是基数，不会多减出负数
            long discount = CouponFaceValue.discountOf(CouponType.DISCOUNT, null, BigDecimal.ZERO, 99999L, base(800));
            assertEquals(800, discount);
        }
    }
}
