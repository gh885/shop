import { Card, CardContent, CardHeader, CardTitle, Field, ImageUploadGrid } from "@shop/ui-web"

import { uploadProductImage } from "../../data"

import type { BasicForm } from "./form-instance"

/**
 * 发布页「图文详情」区块（section-detail）：详情图流（数组，按序铺开渲染，代替富文本 HTML）。
 *
 * 与主图/图集同为 basic 字段（detailImages 随 updateBasic 落库），只是视觉上排在销售信息之下。
 * 可拖拽排序；直传七牛（upload=uploadProductImage）；无封面概念（每张都是详情图）。
 */
export function DetailImagesSection({ form }: { form: BasicForm }) {
    return (
        <Card
            id="section-detail"
            className="scroll-mt-16"
        >
            <CardHeader>
                <CardTitle>
                    <span className="mr-2 text-muted-foreground/60 tabular-nums">03</span>
                    图文详情
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
                <form.AppField name="detailImages">
                    {(field) => (
                        <Field
                            label="详情图"
                            layout="horizontal"
                            hint="按顺序铺开渲染，可拖拽排序；建议 750 宽竖长图、单张 5MB 以内"
                        >
                            <ImageUploadGrid
                                value={field.state.value}
                                onChange={(imgs) => field.handleChange(imgs)}
                                label="上传详情图"
                                maxCount={10}
                                size="size-24"
                                upload={uploadProductImage}
                                className="max-w-[33rem]"
                            />
                        </Field>
                    )}
                </form.AppField>
            </CardContent>
        </Card>
    )
}
