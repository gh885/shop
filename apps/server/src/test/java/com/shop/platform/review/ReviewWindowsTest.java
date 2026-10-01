package com.shop.platform.review;

import static org.junit.jupiter.api.Assertions.*;

import com.shop.platform.review.service.ReviewWindows;
import java.time.OffsetDateTime;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

/**
 * 评价窗口边界（REV-03）：完成（确认收货 / 超时自动收货）后 30 天内可评。
 *
 * <p>关键在开闭：截止时刻由 `isBefore` 判定，恰在 deadline 那刻出窗（左闭右开），
 * 且未完成（completedAt 为 null）恒不可评——这两格靠 IT 里的时间旅行很难钉，收在纯函数直测。
 */
class ReviewWindowsTest {

    private static final OffsetDateTime COMPLETED_AT = OffsetDateTime.parse("2026-01-01T00:00:00Z");

    @Nested
    class 窗口常量 {
        @Test
        void 可评天数是30() {
            assertEquals(30, ReviewWindows.FOLLOW_UP_DAYS);
        }

        @Test
        void 截止时刻等于完成加30天() {
            assertEquals(OffsetDateTime.parse("2026-01-31T00:00:00Z"), ReviewWindows.deadline(COMPLETED_AT));
        }
    }

    @Nested
    class 窗口开闭 {
        @Test
        void 完成当天_窗口内() {
            assertTrue(ReviewWindows.open(COMPLETED_AT, COMPLETED_AT));
        }

        @Test
        void 截止前一刻_仍在窗() {
            assertTrue(ReviewWindows.open(
                    COMPLETED_AT, ReviewWindows.deadline(COMPLETED_AT).minusSeconds(1)));
        }

        @Test
        void 恰至截止时刻_出窗() {
            // 左闭右开：deadline 那秒 isBefore 为 false
            assertFalse(ReviewWindows.open(COMPLETED_AT, ReviewWindows.deadline(COMPLETED_AT)));
        }

        @Test
        void 超过窗口_不可评() {
            assertFalse(ReviewWindows.open(
                    COMPLETED_AT, ReviewWindows.deadline(COMPLETED_AT).plusDays(1)));
        }

        @Test
        void 订单未完成_恒不可评() {
            assertFalse(ReviewWindows.open(null, OffsetDateTime.parse("2026-02-01T00:00:00Z")));
        }
    }
}
