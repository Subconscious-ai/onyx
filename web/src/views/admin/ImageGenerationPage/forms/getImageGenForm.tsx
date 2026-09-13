import React from "react";
import { BedrockImageGenForm } from "@/views/admin/ImageGenerationPage/forms/BedrockImageGenForm";
import { ImageGenFormBaseProps } from "@/views/admin/ImageGenerationPage/forms/types";
import { OpenAIImageGenForm } from "@/views/admin/ImageGenerationPage/forms/OpenAIImageGenForm";
import { AzureImageGenForm } from "@/views/admin/ImageGenerationPage/forms/AzureImageGenForm";
import { VertexImageGenForm } from "@/views/admin/ImageGenerationPage/forms/VertexImageGenForm";

/**
 * Factory function that routes to the correct provider-specific form
 * based on the imageProvider.provider_name.
 */
export function getImageGenForm(props: ImageGenFormBaseProps): React.ReactNode {
  const providerName = props.imageProvider.provider_name;

  switch (providerName) {
    case "bedrock":
      return <BedrockImageGenForm {...props} />;
    case "openai":
      return <OpenAIImageGenForm {...props} />;
    case "azure":
      return <AzureImageGenForm {...props} />;
    case "vertex_ai":
      return <VertexImageGenForm {...props} />;
    default:
      // Fallback to OpenAI form for unknown providers
      console.warn(
        `Unknown image provider: ${providerName}, falling back to OpenAI form`
      );
      return <OpenAIImageGenForm {...props} />;
  }
}
