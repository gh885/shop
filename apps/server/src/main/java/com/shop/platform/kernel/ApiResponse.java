package com.shop.platform.kernel;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Getter;

@Getter
@JsonInclude(JsonInclude.Include.NON_NULL)
public class ApiResponse<T> {

    private T data;
    private ApiMeta meta;

    public ApiResponse() {}

    public ApiResponse(T data, ApiMeta meta) {
        this.data = data;
        this.meta = meta;
    }

    public static <T> ApiResponse<T> ok(T data, String requestId) {
        return new ApiResponse<>(data, new ApiMeta(requestId, OffsetDateTimeProvider.now()));
    }

}
