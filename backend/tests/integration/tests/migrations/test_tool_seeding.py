from pydantic import BaseModel
from sqlalchemy import text

from onyx.db.engine.sql_engine import get_session_with_current_tenant
from tests.integration.common_utils.reset import downgrade_postgres, upgrade_postgres


class ToolSeedingExpectedResult(BaseModel):
    name: str
    display_name: str
    in_code_tool_id: str
    user_id: str | None
    enabled: bool = True


EXPECTED_TOOLS = {
    "CompanyProfileTool": ToolSeedingExpectedResult(
        name="CompanyProfileTool",
        display_name="Company profile",
        in_code_tool_id="CompanyProfileTool",
        user_id=None,
    ),
    "SearchTool": ToolSeedingExpectedResult(
        name="internal_search",
        display_name="Internal Search",
        in_code_tool_id="SearchTool",
        user_id=None,
    ),
    "ImageGenerationTool": ToolSeedingExpectedResult(
        name="generate_image",
        display_name="Image Generation",
        in_code_tool_id="ImageGenerationTool",
        user_id=None,
    ),
    "WebSearchTool": ToolSeedingExpectedResult(
        name="web_search",
        display_name="Web Search",
        in_code_tool_id="WebSearchTool",
        user_id=None,
    ),
    "KnowledgeGraphTool": ToolSeedingExpectedResult(
        name="run_kg_search",
        display_name="Knowledge Graph Search",
        in_code_tool_id="KnowledgeGraphTool",
        user_id=None,
    ),
    "OktaProfileTool": ToolSeedingExpectedResult(
        name="OktaProfileTool",
        display_name="Okta Profile",
        in_code_tool_id="OktaProfileTool",
        user_id=None,
    ),
    "OpenURLTool": ToolSeedingExpectedResult(
        name="open_url",
        display_name="Open URL",
        in_code_tool_id="OpenURLTool",
        user_id=None,
    ),
    "PythonTool": ToolSeedingExpectedResult(
        name="run_python",
        display_name="Code Interpreter",
        in_code_tool_id="PythonTool",
        user_id=None,
    ),
    "ResearchAgent": ToolSeedingExpectedResult(
        name="research_agent",
        display_name="Research Agent",
        in_code_tool_id="ResearchAgent",
        user_id=None,
        enabled=False,
    ),
    "FileReaderTool": ToolSeedingExpectedResult(
        name="read_file",
        display_name="File Reader",
        in_code_tool_id="FileReaderTool",
        user_id=None,
    ),
    "MemoryTool": ToolSeedingExpectedResult(
        name="MemoryTool",
        display_name="Add Memory",
        in_code_tool_id="MemoryTool",
        user_id=None,
    ),
    "CodingAgentTool": ToolSeedingExpectedResult(
        name="coding_agent",
        display_name="Coding Agent",
        in_code_tool_id="CodingAgentTool",
        user_id=None,
    ),
}


def test_tool_seeding_migration() -> None:
    """Test that migration from base to head correctly seeds builtin tools."""
    # Start from base and upgrade to just before tool seeding
    downgrade_postgres(
        database="postgres", config_name="alembic", revision="base", clear_data=True
    )
    upgrade_postgres(
        database="postgres",
        config_name="alembic",
        revision="b7ec9b5b505f",  # Revision before tool seeding
    )

    # Verify no tools exist yet
    with get_session_with_current_tenant() as db_session:
        result = db_session.execute(text("SELECT COUNT(*) FROM tool"))
        count = result.scalar()
        assert count == 0, "No tools should exist before migration"

    # Upgrade to head
    upgrade_postgres(
        database="postgres",
        config_name="alembic",
        revision="head",
    )

    # Verify tools were created
    with get_session_with_current_tenant() as db_session:
        result = db_session.execute(
            text("""
                SELECT id, name, display_name, description, in_code_tool_id,
                       user_id, enabled
                FROM tool
                ORDER BY id
                """)
        )
        tools = result.fetchall()

        assert len(tools) == len(EXPECTED_TOOLS), (
            f"Should have created exactly {len(EXPECTED_TOOLS)} builtin tools, "
            f"got {len(tools)}"
        )
        assert {tool[4] for tool in tools} == set(EXPECTED_TOOLS), (
            "Seeded builtin tool identities should match the expected tools"
        )

        def validate_tool(expected: ToolSeedingExpectedResult) -> None:
            tool = next((t for t in tools if t[1] == expected.name), None)
            assert tool is not None, f"{expected.name} should exist"
            assert tool[2] == expected.display_name, (
                f"{expected.name} display name should be '{expected.display_name}'"
            )
            assert tool[4] == expected.in_code_tool_id, (
                f"{expected.name} in_code_tool_id should be '{expected.in_code_tool_id}'"
            )
            assert tool[5] is None, (
                f"{expected.name} should not have a user_id (builtin)"
            )
            assert tool[6] == expected.enabled, (
                f"{expected.name} enabled should be {expected.enabled}"
            )

        for expected in EXPECTED_TOOLS.values():
            validate_tool(expected)
