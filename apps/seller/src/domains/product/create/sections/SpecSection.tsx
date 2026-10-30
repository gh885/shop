import { useState } from "react"
import { Button, Field, FieldDescription, FieldLabel, Input } from "@shop/ui-web"
import { X } from "lucide-react"
import type { CategoryConfig } from "@shop/api/sdk"

import { useT } from "#/locales/use-t"
import { activeValues, specAttributes, type Dimensions, type FieldErrors } from "../model"
import { isCreateFieldErrorKey } from "../submit"

type Attr = CategoryConfig["attributes"][number]

export function SpecSection({
    config,
    dimensions,
    errors,
    onChange,
}: {
    config: CategoryConfig
    dimensions: Dimensions
    errors: FieldErrors
    onChange: (next: Dimensions) => void
}) {
    const t = useT("product")
    const errorText = (key: string) => (isCreateFieldErrorKey(key) ? t(key) : key)
    const attributes = specAttributes(config)

    return (
        <section
            id="section-specs"
            className="scroll-mt-16 space-y-5 rounded-lg bg-background p-5 shadow-sm"
        >
            <h2 className="text-base font-semibold">{t("product.create.section.specs")}</h2>
            {attributes.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("product.create.specs.none")}</p>
            ) : (
                <>
                    <p className="text-sm text-muted-foreground">
                        {t("product.create.specs.hint")}
                    </p>
                    {attributes.map((attribute) => (
                        <DimensionField
                            key={attribute.id}
                            attribute={attribute}
                            values={dimensions[attribute.id] ?? []}
                            error={errors[`spec:${attribute.id}`]}
                            errorText={errorText}
                            onChange={(next) => onChange({ ...dimensions, [attribute.id]: next })}
                        />
                    ))}
                </>
            )}
        </section>
    )
}

function DimensionField({
    attribute,
    values,
    error,
    errorText,
    onChange,
}: {
    attribute: Attr
    values: string[]
    error: string | undefined
    errorText: (key: string) => string
    onChange: (next: string[]) => void
}) {
    const t = useT("product")
    const [custom, setCustom] = useState("")
    const options = activeValues(attribute)
    const selectedValues = new Set(values)
    const optionSet = new Set(options)

    return (
        <Field orientation="horizontal">
            <FieldLabel required={attribute.required}>{attribute.name}</FieldLabel>
            <div className="flex flex-wrap items-center gap-2">
                {options.map((option) => {
                    const selected = selectedValues.has(option)
                    return (
                        <Button
                            key={option}
                            type="button"
                            size="sm"
                            variant={selected ? "default" : "outline"}
                            onClick={() =>
                                onChange(
                                    selected
                                        ? values.filter((item) => item !== option)
                                        : [...values, option],
                                )
                            }
                        >
                            {option}
                        </Button>
                    )
                })}
                {values
                    .filter((item) => !optionSet.has(item))
                    .map((item) => (
                        <span
                            key={item}
                            className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-sm"
                        >
                            {item}
                            <button
                                type="button"
                                aria-label={t("product.create.attr.removeValue", { value: item })}
                                onClick={() => onChange(values.filter((entry) => entry !== item))}
                            >
                                <X className="size-3.5" />
                            </button>
                        </span>
                    ))}
                {attribute.allowCustom ? (
                    <span className="flex items-center gap-1">
                        <Input
                            value={custom}
                            maxLength={64}
                            placeholder={t("product.create.specs.valuePlaceholder")}
                            onChange={(event) => setCustom(event.target.value)}
                            className="h-9 w-36"
                        />
                        <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={custom.trim() === ""}
                            onClick={() => {
                                const next = custom.trim()
                                if (next !== "" && !values.includes(next))
                                    onChange([...values, next])
                                setCustom("")
                            }}
                        >
                            {t("product.create.specs.addValue")}
                        </Button>
                    </span>
                ) : null}
            </div>
            {error ? (
                <p
                    role="alert"
                    className="text-sm text-destructive"
                >
                    {errorText(error)}
                </p>
            ) : (
                <FieldDescription>{t("product.create.specs.dimensionHint")}</FieldDescription>
            )}
        </Field>
    )
}
