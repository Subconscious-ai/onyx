"""Offline checks using the native backend dependencies. No provider calls."""

import unittest
from unittest.mock import patch

from mcp.types import CallToolResult, ImageContent, TextContent
from sqlalchemy import create_engine, select, text

from onyx.configs.constants import NotificationType
from onyx.db.models import Notification
from onyx.db.notification import _notification_filters
from onyx.image_gen.factory import get_image_generation_provider
from onyx.image_gen.interfaces import ImageGenerationProviderCredentials, ReferenceImage
from onyx.server.features.mcp.client import process_mcp_result

PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aH0sAAAAASUVORK5CYII="


class AnalystImages(unittest.TestCase):
    def test_mcp_chart_becomes_a_native_file_link_without_base64_in_the_answer(self):
        result = CallToolResult(
            content=[
                TextContent(type="text", text="Measured result"),
                ImageContent(type="image", data=PNG, mimeType="image/png"),
            ]
        )
        with patch(
            "onyx.file_store.utils.save_file_from_base64", return_value="chart-file"
        ):
            answer = process_mcp_result(result)
        self.assertIn("/api/chat/file/chart-file", answer)
        self.assertIn("Measured result", answer)
        self.assertNotIn(PNG, answer)

    def test_svg_from_a_tool_is_not_persisted_as_a_display_image(self):
        result = CallToolResult(
            content=[ImageContent(type="image", data=PNG, mimeType="image/svg+xml")]
        )
        with patch("onyx.file_store.utils.save_file_from_base64") as save:
            answer = process_mcp_result(result)
        save.assert_not_called()
        self.assertIn("unavailable", answer.lower())


class BedrockImages(unittest.TestCase):
    def test_native_provider_uses_aws_without_an_openai_secret(self):
        provider = get_image_generation_provider(
            "bedrock",
            ImageGenerationProviderCredentials(
                custom_config={"aws_region_name": "us-east-1"}
            ),
        )
        with patch("litellm.image_generation") as generate:
            provider.generate_image(
                prompt="A vanilla ice cream cone",
                model="amazon.nova-canvas-v1:0",
                size="1024x1024",
                n=1,
                response_format="b64_json",
            )
        arguments = generate.call_args.kwargs
        self.assertEqual(arguments["model"], "bedrock/amazon.nova-canvas-v1:0")
        self.assertEqual(arguments["aws_region_name"], "us-east-1")
        self.assertNotIn("api_key", arguments)

    def test_unsupported_edit_never_silently_becomes_a_new_picture(self):
        provider = get_image_generation_provider(
            "bedrock", ImageGenerationProviderCredentials()
        )
        with (
            patch("litellm.image_generation") as generate,
            self.assertRaises(ValueError),
        ):
            provider.generate_image(
                prompt="Edit",
                model="amazon.nova-canvas-v1:0",
                size="1024x1024",
                n=1,
                reference_images=[ReferenceImage(data=b"image", mime_type="image/png")],
            )
        generate.assert_not_called()


class ProductNotifications(unittest.TestCase):
    def test_upstream_promotions_are_excluded_and_operational_messages_remain(self):
        engine = create_engine("sqlite://")
        with engine.begin() as connection:
            connection.execute(
                text("CREATE TABLE notification (notif_type TEXT, user_id TEXT)")
            )
            for kind in (
                "release_notes",
                "feature_announcement",
                "connector_invalid",
                "system_announcement",
            ):
                connection.execute(
                    text("INSERT INTO notification VALUES (:kind, NULL)"),
                    {"kind": NotificationType(kind).name},
                )
            connection.execute(
                text(
                    "INSERT INTO notification VALUES ('CONNECTOR_INVALID', 'another-account')"
                )
            )
            statement = select(Notification.notif_type).where(
                *_notification_filters(None)
            )
            kinds = {kind.value for kind in connection.scalars(statement)}
        self.assertEqual(kinds, {"connector_invalid", "system_announcement"})


if __name__ == "__main__":
    unittest.main()
