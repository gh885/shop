package com.shop.platform.logistics;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.shop.platform.common.BusinessException;
import com.shop.platform.logistics.mapper.Shipment;
import com.shop.platform.logistics.mapper.ShipmentMapper;
import com.shop.platform.logistics.service.CarrierPush;
import com.shop.platform.logistics.service.CarrierPushReceiver;
import com.shop.platform.logistics.service.TrackingPushService;
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
 * 推送落地的领域处理单测：运单号能不能匹配到我们的包裹、匹配不到时怎么处理。
 *
 * <p>匹配不到时<b>静默成功</b>是要紧的行为（报错会让对方按重试策略反复推一个我们永远处理不了的报文），
 * 所以专门钉一条。
 */
@ExtendWith(MockitoExtension.class)
class TrackingPushServiceTest {

    @Mock
    private CarrierPushReceiver receiver;

    @Mock
    private TrackingSyncService trackingSyncService;

    @Mock
    private ShipmentMapper shipmentMapper;

    @InjectMocks
    private TrackingPushService trackingPushService;

    private final Shipment shipment = Shipment.builder()
            .id(UUID.randomUUID())
            .trackingNo("SF123")
            .shippedAt(OffsetDateTime.now())
            .build();

    @Test
    void 运单号匹配不到包裹_静默成功_不报错也不落库() {
        when(receiver.receive(any(), any(), any())).thenReturn(new CarrierPush("SF123", List.of()));
        when(shipmentMapper.selectByTrackingNo("SF123")).thenReturn(null);

        trackingPushService.accept("SF", "{}", "sign");

        verify(trackingSyncService, never()).record(any(), any());
    }

    @Test
    void 匹配到包裹_走与轮询同一条落库路径() {
        when(receiver.receive(any(), any(), any())).thenReturn(new CarrierPush("SF123", List.of()));
        when(shipmentMapper.selectByTrackingNo("SF123")).thenReturn(shipment);
        when(trackingSyncService.record(any(), any())).thenReturn(2);

        trackingPushService.accept("SF", "{}", "sign");

        verify(trackingSyncService).record(shipment, List.of());
    }

    @Test
    void 验签失败由接收端口抛出_不落库() {
        when(receiver.receive(any(), any(), any())).thenThrow(new BusinessException(403, "签名校验失败"));

        assertThatThrownBy(() -> trackingPushService.accept("SF", "{}", "bad"))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getHttpStatus())
                .isEqualTo(403);
        verify(trackingSyncService, never()).record(any(), any());
    }
}
