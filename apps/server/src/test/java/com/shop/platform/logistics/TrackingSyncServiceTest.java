package com.shop.platform.logistics;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.shop.platform.logistics.dto.TrackingNodeRequest;
import com.shop.platform.logistics.mapper.Shipment;
import com.shop.platform.logistics.model.TrackingNodeCode;
import com.shop.platform.logistics.service.CarrierTrackingGateway;
import com.shop.platform.logistics.service.CarrierTrackingNode;
import com.shop.platform.logistics.service.TrackingService;
import com.shop.platform.logistics.service.TrackingSyncService;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/**
 * 同步层的边界处理：时刻缺失与无法归一的条目都要被<b>干净跳过</b>——前者此前会撞 dedupeKey 的 NPE
 * （被 catch 兜住但日志打的是"落库失败"，误导排查），后者按 LOG-20 不猜。
 */
@ExtendWith(MockitoExtension.class)
class TrackingSyncServiceTest {

    @Mock
    private CarrierTrackingGateway gateway;

    @Mock
    private TrackingService trackingService;

    @InjectMocks
    private TrackingSyncService trackingSyncService;

    private final Shipment shipment =
            Shipment.builder().id(UUID.randomUUID()).trackingNo("SF1").build();

    @Test
    void 缺少事件时刻_跳过且不触碰落库路径() {
        int recorded =
                trackingSyncService.record(shipment, List.of(new CarrierTrackingNode("3", "快件已签收，签收人：本人", "上海", null)));

        assertThat(recorded).isZero();
        verify(trackingService, never()).recordNode(any(), any());
    }

    @Test
    void 无法归一与缺时刻各自跳过_能落库的照常投递() {
        when(trackingService.recordNode(any(), any(TrackingNodeRequest.class))).thenReturn(true);
        OffsetDateTime at = OffsetDateTime.now();

        int recorded = trackingSyncService.record(
                shipment,
                List.of(
                        new CarrierTrackingNode("0", "客官您好，感谢使用", null, at),
                        new CarrierTrackingNode("1", "快件已揽收", "杭州", null),
                        new CarrierTrackingNode("1", "快件已揽收", "杭州", at)));

        assertThat(recorded).isEqualTo(1);
        verify(trackingService)
                .recordNode(shipment.getId(), new TrackingNodeRequest(TrackingNodeCode.PICKED_UP, at, "快件已揽收", "杭州"));
    }
}
