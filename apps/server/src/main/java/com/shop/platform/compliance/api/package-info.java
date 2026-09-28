/**
 * Compliance 模块对外命名接口（跨模块同步调用）。
 *
 * <p>只有一条命令 {@link com.shop.platform.compliance.api.ForbiddenWordCommand}：供 product / review /
 * aftersale 在自己的写入事务里做「这段公开文本能不能过闸」的判定；同事务原子——不过闸则该次写入回滚。
 * 命中分类词表 {@link com.shop.platform.compliance.api.ForbiddenCategory} 让消费方能给出可行动的提示。
 *
 * <p>为什么是同步命令而不是事件：内容闸门必须在写入的同一事务里裁决，「先写后异步扫」意味着违规文本
 * 已经公开过（哪怕秒删），那是事后补救不是闸门。
 */
@org.springframework.modulith.NamedInterface("api")
package com.shop.platform.compliance.api;
