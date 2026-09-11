"use client";

import { useTranslations } from "next-intl";
import * as Yup from "yup";
import { Disabled } from "@opal/core";
import { InputTypeIn } from "@opal/components";
import { FormikField } from "@/refresh-components/form/FormikField";
import { FormField } from "@/refresh-components/form/FormField";
import { ImageGenFormWrapper } from "@/views/admin/ImageGenerationPage/forms/ImageGenFormWrapper";
import type { ImageGenFormBaseProps } from "@/views/admin/ImageGenerationPage/forms/types";

export function BedrockImageGenForm(props: ImageGenFormBaseProps) {
  const t = useTranslations("admin.imageGeneration");
  return (
    <ImageGenFormWrapper
      {...props}
      title={props.imageProvider.title}
      description={t("providers.bedrockCanvas.description")}
      initialValues={{ region: "us-east-1" }}
      validationSchema={Yup.object({
        region: Yup.string()
          .matches(/^[a-z]{2}(-[a-z]+)+-\d$/)
          .required(),
      })}
      getInitialValuesFromCredentials={(credentials) => ({
        region: credentials.custom_config?.aws_region_name || "us-east-1",
      })}
      transformValues={(values) => ({
        modelName: props.imageProvider.model_name,
        imageProviderId: props.imageProvider.image_provider_id,
        provider: "bedrock",
        customConfig: { aws_region_name: values.region },
      })}
    >
      {({ disabled, resetApiState }) => (
        <FormikField<string>
          name="region"
          render={(field, _helper, _meta, state) => (
            <FormField name="region" state={state}>
              <FormField.Label>
                {t("providers.bedrockCanvas.region")}
              </FormField.Label>
              <FormField.Control>
                <Disabled disabled={disabled}>
                  <InputTypeIn
                    {...field}
                    onChange={(event) => {
                      field.onChange(event);
                      resetApiState();
                    }}
                  />
                </Disabled>
              </FormField.Control>
            </FormField>
          )}
        />
      )}
    </ImageGenFormWrapper>
  );
}
