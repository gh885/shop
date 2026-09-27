package com.shop.platform.review.dto;

import com.shop.platform.common.NoteFieldRules;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** 追评（POST /reviews/{id}/append）：纯文字一段，只此一次（REV-09）。 */
@Schema(description = "追评")
public record AppendReviewRequest(@NotBlank @Size(max = NoteFieldRules.FREE_TEXT_MAX) String text) {}
