package com.shop.platform.infra.db;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

/** 对账探针：只回 count>0 的检查；单项 SQL 失败被吞、不影响其余。 */
class ReconcileProbeTest {

    @Test
    void 只回不一致的检查() {
        JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
        // 8 条检查的返回：只有第 2 条（锁定超时用户券）与第 4 条（在架但无可售库存的商品）有差异
        when(jdbcTemplate.queryForObject(anyString(), eq(Integer.class))).thenReturn(0, 1, 0, 2, 0, 0, 0, 0);

        List<ReconcileProbe.Mismatch> mismatches = new ReconcileProbe(jdbcTemplate).findMismatches();

        assertThat(mismatches)
                .containsExactly(
                        new ReconcileProbe.Mismatch("锁定超时用户券", 1), new ReconcileProbe.Mismatch("在架但无可售库存的商品", 2));
    }

    @Test
    void 单项SQL失败被跳过_其余照常汇总() {
        JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
        // 第 1 条查询抛错（吞掉），其后紧接的第 2 条（锁定超时用户券）返回 1 应被保留
        when(jdbcTemplate.queryForObject(anyString(), eq(Integer.class)))
                .thenThrow(new RuntimeException("连不上"))
                .thenReturn(1, 0, 0, 0, 0, 0, 0);

        List<ReconcileProbe.Mismatch> mismatches = new ReconcileProbe(jdbcTemplate).findMismatches();

        assertThat(mismatches).containsExactly(new ReconcileProbe.Mismatch("锁定超时用户券", 1));
    }
}
