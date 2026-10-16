package com.shop.platform.rum.infra;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.shop.platform.rum.RumProperties;
import com.shop.platform.rum.mapper.RumEventMapper;
import java.time.OffsetDateTime;
import java.time.temporal.ChronoUnit;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

/**
 * 清理作业的两条语义：**分批删到删不动为止**、**保留期不成立时一行都不删**。
 *
 * <p>后者是这里的重点。这个键的默认值是 {@code minusDays(0)}，也就是「删掉此刻之前的全部」——
 * 而它缺失的样子（yml 里那行被人挪走）不会报任何错。一个把表清空的作业值得一道显式闸门，
 * 因为那是最难回滚的一类事故。
 */
class RumRetentionJobTest {

    private final RumEventMapper mapper = mock(RumEventMapper.class);
    private final RumProperties properties = new RumProperties();
    private final RumRetentionJob job = new RumRetentionJob(mapper, properties);

    @Test
    void 分批删_删满一批就继续_删不满就停() {
        properties.setRetentionDays(14);
        // 5000 是作业的批大小：前两批删满说明后面可能还有，第三批删不满即收工
        when(mapper.deleteBatchBefore(any(), anyInt())).thenReturn(5000, 5000, 12);

        job.purgeExpired();

        verify(mapper, times(3)).deleteBatchBefore(any(), anyInt());
    }

    @Test
    void 保留期不成立时什么都不删() {
        properties.setRetentionDays(0);

        job.purgeExpired();

        verifyNoInteractions(mapper);
    }

    @Test
    void 截止时刻是当前时刻减保留天数() {
        properties.setRetentionDays(14);
        when(mapper.deleteBatchBefore(any(), anyInt())).thenReturn(0);

        job.purgeExpired();

        ArgumentCaptor<OffsetDateTime> cutoff = ArgumentCaptor.forClass(OffsetDateTime.class);
        verify(mapper).deleteBatchBefore(cutoff.capture(), anyInt());
        assertThat(cutoff.getValue()).isCloseTo(OffsetDateTime.now().minusDays(14), within(1, ChronoUnit.MINUTES));
    }

    /** 保留期是唯一的输入，页面上没有别的口子能改它——这条钉的是「作业不吃别的状态」 */
    @Test
    void 作业不读接收端开关() {
        properties.setEnabled(false);
        properties.setRetentionDays(14);
        when(mapper.deleteBatchBefore(any(), anyInt())).thenReturn(7);

        job.purgeExpired();

        verify(mapper).deleteBatchBefore(any(), anyInt());
    }
}
