package com.shop.platform.common.id;

import com.github.f4b6a3.uuid.UuidCreator;
import java.util.UUID;

/**
 * 全局 ID 的唯一来源。
 *
 * <p>用 UUIDv7 而不是 v4：v7 前 48 位是毫秒时间戳，B-tree 插入是顺序追加；v4 完全随机，表一大就随机写页、索引碎片化。
 *
 * <p>库里的主键默认交给 PG 的 {@code uuidv7()}（见迁移脚本），Java 侧只在两个场合自己生成：需要在写库之前就把 ID
 * 交出去（事件 ID、先返回后落库的 ID），以及没有库可用的纯单元测试。
 */
public final class Ids {

    private Ids() {}

    public static UUID newId() {
        return UuidCreator.getTimeOrderedEpoch();
    }
}
