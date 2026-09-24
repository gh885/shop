package com.shop.platform.logistics.dto;

import com.shop.platform.common.NoteFieldRules;
import jakarta.validation.constraints.Size;

/** 结单入参：处理说明（可空——客服只是标记"催过了"时不必硬编一句）。 */
public record ResolveIssueRequest(@Size(max = NoteFieldRules.FREE_TEXT_MAX) String note) {}
