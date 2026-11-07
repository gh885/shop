import { useState } from "react"

import { useT } from "#/locales/use-t"
import { imgUrl } from "#/shared/lib/image"
import {
    Button,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    ImageUploadGrid,
    Label,
    Switch,
    Textarea,
} from "@shop/ui-web"

import { uploadReviewImage } from "./queries"
import { StarPicker } from "./stars"
import type { ReviewItem } from "./rules"

const CONTENT_MAX = 500
const IMAGE_MAX = 9

function ContentField({
    value,
    onChange,
    placeholder,
}: {
    value: string
    onChange: (value: string) => void
    placeholder: string
}) {
    return (
        <div className="space-y-1.5">
            <Textarea
                value={value}
                onChange={(event) => onChange(event.target.value.slice(0, CONTENT_MAX))}
                placeholder={placeholder}
                rows={4}
            />
            <p className="text-right text-xs text-muted-foreground">
                {value.length}/{CONTENT_MAX}
            </p>
        </div>
    )
}

/** 提交评价：总体星（必填）+ 三维分（可空）+ 正文 + 晒图 ≤9 + 匿名。 */
export function SubmitReviewDialog({
    item,
    onOpenChange,
    onSubmit,
    pending,
}: {
    item: ReviewItem | undefined
    onOpenChange: (open: boolean) => void
    onSubmit: (input: {
        reviewId: string
        overall: number
        descScore?: number
        serviceScore?: number
        logisticsScore?: number
        content?: string
        images: string[]
        anonymous: boolean
    }) => Promise<unknown>
    pending: boolean
}) {
    const t = useT()
    const [overall, setOverall] = useState(5)
    const [descScore, setDescScore] = useState(5)
    const [serviceScore, setServiceScore] = useState(5)
    const [logisticsScore, setLogisticsScore] = useState(5)
    const [content, setContent] = useState("")
    const [images, setImages] = useState<string[]>([])
    const [anonymous, setAnonymous] = useState(false)

    async function handleSubmit() {
        if (!item) return
        await onSubmit({
            reviewId: item.id,
            overall,
            descScore,
            serviceScore,
            logisticsScore,
            content: content.trim() || undefined,
            images,
            anonymous,
        })
        onOpenChange(false)
    }

    return (
        <Dialog
            open={item !== undefined}
            onOpenChange={(open) => {
                if (!open) {
                    setOverall(5)
                    setDescScore(5)
                    setServiceScore(5)
                    setLogisticsScore(5)
                    setContent("")
                    setImages([])
                    setAnonymous(false)
                }
                onOpenChange(open)
            }}
        >
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>{t("review.submit.title")}</DialogTitle>
                    {item && <DialogDescription>{item.title}</DialogDescription>}
                </DialogHeader>

                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <Label>{t("review.submit.overall")}</Label>
                        <StarPicker
                            value={overall}
                            onChange={setOverall}
                        />
                    </div>
                    <div className="flex items-center justify-between">
                        <Label>{t("review.submit.desc")}</Label>
                        <StarPicker
                            value={descScore}
                            onChange={setDescScore}
                            size="size-4"
                        />
                    </div>
                    <div className="flex items-center justify-between">
                        <Label>{t("review.submit.service")}</Label>
                        <StarPicker
                            value={serviceScore}
                            onChange={setServiceScore}
                            size="size-4"
                        />
                    </div>
                    <div className="flex items-center justify-between">
                        <Label>{t("review.submit.logistics")}</Label>
                        <StarPicker
                            value={logisticsScore}
                            onChange={setLogisticsScore}
                            size="size-4"
                        />
                    </div>

                    <ContentField
                        value={content}
                        onChange={setContent}
                        placeholder={t("review.submit.contentPlaceholder")}
                    />

                    <div className="space-y-1.5">
                        <Label>{t("review.submit.images", { count: images.length })}</Label>
                        <ImageUploadGrid
                            value={images}
                            onChange={setImages}
                            maxCount={IMAGE_MAX}
                            upload={uploadReviewImage}
                            resolveSrc={imgUrl}
                            size="size-20"
                        />
                    </div>

                    <div className="flex items-center justify-between">
                        <Label>{t("review.submit.anonymous")}</Label>
                        <Switch
                            checked={anonymous}
                            onCheckedChange={setAnonymous}
                        />
                    </div>

                    <div className="flex justify-end gap-2">
                        <Button
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                        >
                            {t("review.submit.cancel")}
                        </Button>
                        <Button
                            disabled={pending}
                            onClick={() => void handleSubmit()}
                        >
                            {t("review.submit.submit")}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}

/** 追评：正文 + 图，一次。 */
export function AppendReviewDialog({
    item,
    onOpenChange,
    onAppend,
    pending,
}: {
    item: ReviewItem | undefined
    onOpenChange: (open: boolean) => void
    onAppend: (input: { reviewId: string; content?: string; images: string[] }) => Promise<unknown>
    pending: boolean
}) {
    const t = useT()
    const [content, setContent] = useState("")
    const [images, setImages] = useState<string[]>([])

    async function handleAppend() {
        if (!item) return
        await onAppend({ reviewId: item.id, content: content.trim() || undefined, images })
        onOpenChange(false)
    }

    return (
        <Dialog
            open={item !== undefined}
            onOpenChange={(open) => {
                if (!open) {
                    setContent("")
                    setImages([])
                }
                onOpenChange(open)
            }}
        >
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>{t("review.append.title")}</DialogTitle>
                    {item && <DialogDescription>{item.title}</DialogDescription>}
                </DialogHeader>

                <div className="space-y-4">
                    <ContentField
                        value={content}
                        onChange={setContent}
                        placeholder={t("review.append.placeholder")}
                    />
                    <ImageUploadGrid
                        value={images}
                        onChange={setImages}
                        maxCount={IMAGE_MAX}
                        upload={uploadReviewImage}
                        resolveSrc={imgUrl}
                        size="size-20"
                    />
                    <div className="flex justify-end gap-2">
                        <Button
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                        >
                            {t("review.submit.cancel")}
                        </Button>
                        <Button
                            disabled={pending}
                            onClick={() => void handleAppend()}
                        >
                            {t("review.append.submit")}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}
