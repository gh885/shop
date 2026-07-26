package com.shop.platform.common;

import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Getter;

import java.time.OffsetDateTime;

@Getter
public class ApiMeta {

    private String requestId;

    @JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm:ss'Z'", timezone = "UTC")
    private OffsetDateTime requestedAt;

    public ApiMeta() {}

    public ApiMeta(String requestId, OffsetDateTime requestedAt) {
        this.requestId = requestId;
        this.requestedAt = requestedAt;
    }

}
