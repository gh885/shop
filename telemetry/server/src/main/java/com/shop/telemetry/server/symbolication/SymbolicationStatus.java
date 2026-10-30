package com.shop.telemetry.server.symbolication;

/**
 * 符号化的结局。**必须能区分"没上传"和"上传了但不匹配"**——否则用户看到的永远是
 * 一堆压缩位置，而平台说不出为什么。
 */
public enum SymbolicationStatus {
    /** 至少有一帧还原成功 */
    OK,
    /** 事件里没有 debug_id：SDK 没开 sourcemap 注入（或版本太老） */
    NO_DEBUG_ID,
    /** 有 debug_id，但库里没有对应 sourcemap：产物没上传 */
    NO_SOURCEMAP,
    /** 事件里没有栈帧（不是异常事件，或客户端没给） */
    NO_FRAMES,
    /**
     * 栈本来就是可读的（Java / .NET 之类带类名与行号）。
     * 这些事件没有 debug_id 是正常的，不该在界面上提示"没开 sourcemap 注入"。
     */
    NOT_NEEDED
}
