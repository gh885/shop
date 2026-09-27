package com.shop.platform.review.dto;

import com.shop.platform.common.NoteFieldRules;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** 卖家回复（PUT /seller/reviews/{id}/reply）：纯文字一段，只此一次（REV-10）。 */
@Schema(description = "卖家回复评价")
public record ReplyReviewRequest(@NotBlank @Size(max = NoteFieldRules.FREE_TEXT_MAX) String text) {}
