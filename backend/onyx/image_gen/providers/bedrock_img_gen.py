from __future__ import annotations

from typing import TYPE_CHECKING, Any

from onyx.image_gen.interfaces import (
    ImageGenerationProvider,
    ImageGenerationProviderCredentials,
    ReferenceImage,
)
from onyx.tracing.flows import LLMFlow
from onyx.tracing.llm_utils import traced_llm_call

if TYPE_CHECKING:
    from onyx.image_gen.interfaces import ImageGenerationResponse


class BedrockImageGenerationProvider(ImageGenerationProvider):
    """Native image output with LiteLLM and the deployment's AWS credential chain."""

    def __init__(self, region: str | None):
        self._region = region

    @classmethod
    def validate_credentials(
        cls, credentials: ImageGenerationProviderCredentials
    ) -> bool:
        # Provider tests check AWS authorization. No separate vendor secret is needed.
        return not credentials.api_key and not credentials.api_base

    @classmethod
    def _build_from_credentials(
        cls, credentials: ImageGenerationProviderCredentials
    ) -> BedrockImageGenerationProvider:
        return cls((credentials.custom_config or {}).get("aws_region_name"))

    def generate_image(
        self,
        prompt: str,
        model: str,
        size: str,
        n: int,
        quality: str | None = None,
        reference_images: list[ReferenceImage] | None = None,
        **_kwargs: Any,
    ) -> ImageGenerationResponse:
        from litellm import image_generation

        if reference_images:
            raise ValueError(
                "Reference-image editing is not configured for this provider."
            )
        normalized = model.removeprefix("bedrock/")
        if normalized != "amazon.nova-canvas-v1:0":
            raise ValueError("Select the configured Amazon Nova Canvas model.")
        # Nova returns base64 natively and does not accept response_format.
        options: dict[str, Any] = {}
        if self._region:
            options["aws_region_name"] = self._region
        if quality:
            options["quality"] = quality
        with traced_llm_call(
            flow=LLMFlow.IMAGE_GENERATION,
            model=normalized,
            provider="bedrock",
            image_count=n,
            input_messages=[{"role": "user", "content": prompt}],
        ):
            return image_generation(
                prompt=prompt, model=f"bedrock/{normalized}", size=size, n=n, **options
            )
