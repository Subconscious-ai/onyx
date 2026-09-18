"""Seed the optional company profile tool.

Revision ID: a4729d9c1826
Revises: 287021f3b46c
"""

from alembic import op
import sqlalchemy as sa

revision = "a4729d9c1826"
down_revision = "287021f3b46c"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Availability still requires BURN2_ENABLED and explicit persona assignment.
    op.get_bind().execute(
        sa.text(
            """INSERT INTO tool
            (name, display_name, description, in_code_tool_id, enabled)
            SELECT 'CompanyProfileTool', 'Company profile',
                   'Read or correct the signed-in executive working profile.',
                   'CompanyProfileTool', true
            WHERE NOT EXISTS (
                SELECT 1 FROM tool WHERE in_code_tool_id = 'CompanyProfileTool'
            )"""
        )
    )


def downgrade() -> None:
    op.get_bind().execute(
        sa.text("DELETE FROM tool WHERE in_code_tool_id = 'CompanyProfileTool'")
    )
