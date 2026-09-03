import { useEffect, useState } from "react"
import { ImageOff } from "lucide-react"
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    Field,
    Input,
    InputGroup,
    InputGroupAddon,
    InputGroupInput,
    firstFieldError,
} from "@shop/ui-web"

import type { BasicForm } from "./form-instance"

import { z } from "zod"

/** 商品标题（搜索标题）：参与搜索召回的关键词位，上限 30 字 */
const ProductNameSchema = z.string().trim().min(1, "请输入商品标题").max(30, "商品标题最长 30 字")

/** 一句话卖点：可不填；填了就得写够一句（10~30 字），与后端 @Pattern 校验对齐 */
const SellingPointSchema = z
    .string()
    .trim()
    .refine(
        (v) => v.length === 0 || (v.length >= 10 && v.length <= 30),
        "卖点填了就写 10~30 字，不想写可以留空",
    )

/**
 * 发布第二步「基础信息」区块（section-basic）：主图 / 商品标题 / 商品卖点。
 *
 * 表单字段由整体壳(PublishBasicStep)用 useAppForm 创建并持有；这里**只接收 form 实例**做展示
 * （form.AppField 渲染 + 校验），值变化经壳的 form.Subscribe 上报 autosave。
 * 不依赖隐式 context：组件纯净、可独立测试，字段类型完整（不退化 any）。
 */
export function BasicInfoSection({ form }: { form: BasicForm }) {
    return (
        <Card
            id="section-basic"
            className="scroll-mt-16"
        >
            <CardHeader>
                <CardTitle>
                    <span className="mr-2 text-muted-foreground/60 tabular-nums">01</span>
                    基础信息
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
                <form.AppField
                    name="mainImage"
                    validators={{
                        onSubmit: ({ value }) => (value ? undefined : "请填写主图"),
                    }}
                >
                    {(field) => (
                        <Field
                            label="主图"
                            required
                            htmlFor="pf-main-image"
                            layout="horizontal"
                            error={firstFieldError(field)}
                            hint="列表缩略图与详情首图共用，建议 1:1 正方形、800×800 以上（图片上传待接入，先填 URL）"
                        >
                            <div className="flex items-start gap-3">
                                <MainImagePreview url={field.state.value} />
                                <Input
                                    id="pf-main-image"
                                    value={field.state.value}
                                    placeholder="https://…/main.jpg"
                                    maxLength={255}
                                    onChange={(e) => field.handleChange(e.target.value)}
                                    onBlur={field.handleBlur}
                                    className="h-10 flex-1 bg-background"
                                />
                            </div>
                        </Field>
                    )}
                </form.AppField>

                <form.AppField
                    name="name"
                    validators={{
                        onBlur: ProductNameSchema,
                        onSubmit: ProductNameSchema,
                    }}
                >
                    {(field) => (
                        <Field
                            label="商品标题"
                            required
                            htmlFor="pf-name"
                            layout="horizontal"
                            error={firstFieldError(field)}
                            hint="买家搜索靠它命中，把品牌、品类、核心属性写进去"
                        >
                            <InputGroup className="h-10">
                                <InputGroupInput
                                    id="pf-name"
                                    value={field.state.value}
                                    maxLength={30}
                                    placeholder="如：宠物智能喂食器 定时定量 大容量"
                                    onChange={(e) => field.handleChange(e.target.value)}
                                    onBlur={field.handleBlur}
                                    aria-invalid={Boolean(firstFieldError(field)) || undefined}
                                />
                                {field.state.value.length > 0 && (
                                    <InputGroupAddon
                                        align="inline-end"
                                        className="text-xs font-normal tabular-nums text-muted-foreground"
                                    >
                                        {field.state.value.length}/30
                                    </InputGroupAddon>
                                )}
                            </InputGroup>
                        </Field>
                    )}
                </form.AppField>

                <form.AppField
                    name="subtitle"
                    validators={{
                        onBlur: SellingPointSchema,
                        onSubmit: SellingPointSchema,
                    }}
                >
                    {(field) => (
                        <Field
                            label="商品卖点"
                            htmlFor="pf-subtitle"
                            layout="horizontal"
                            error={firstFieldError(field)}
                            hint="选填；填了就写 10~30 字，展示在商品详情页标题下方"
                        >
                            <InputGroup className="h-10">
                                <InputGroupInput
                                    id="pf-subtitle"
                                    value={field.state.value}
                                    maxLength={30}
                                    placeholder="如：定时定量不撑食，断电续航 72 小时"
                                    onChange={(e) => field.handleChange(e.target.value)}
                                    onBlur={field.handleBlur}
                                    aria-invalid={Boolean(firstFieldError(field)) || undefined}
                                />
                                {field.state.value.length > 0 && (
                                    <InputGroupAddon
                                        align="inline-end"
                                        className="text-xs font-normal tabular-nums text-muted-foreground"
                                    >
                                        {field.state.value.length}/30
                                    </InputGroupAddon>
                                )}
                            </InputGroup>
                        </Field>
                    )}
                </form.AppField>
            </CardContent>
        </Card>
    )
}

/** 主图预览：填了 URL 才显示图，加载失败退回占位（不做上传，先给个「填得对不对」的即时反馈） */
function MainImagePreview({ url }: { url: string }) {
    const [broken, setBroken] = useState(false)

    useEffect(() => setBroken(false), [url])

    if (!url || broken) {
        return (
            <div className="flex size-20 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground/60">
                <ImageOff className="size-5" />
            </div>
        )
    }
    return (
        <img
            src={url}
            alt="主图预览"
            className="size-20 shrink-0 rounded-lg bg-muted object-cover"
            onError={() => setBroken(true)}
        />
    )
}
