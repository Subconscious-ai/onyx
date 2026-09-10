from pathlib import Path

p = Path("/app/onyx/chat/process_message.py")
s = p.read_text()
marker = "    forced_tool_id = new_msg_req.forced_tool_id\n"
assert s.count(marker) == 1
assert "import os" in s
p.write_text(
    s.replace(
        marker,
        '    forced_tool_id = new_msg_req.forced_tool_id\n    if os.environ.get("BURN2_ENABLED") == "true" and persona.name == "Burn 2.0" and forced_tool_id is None:\n        from onyx.server.query_and_chat.burn2.requested_tool import requested_tool\n\n        forced_tool_id = requested_tool(message_text, {\n            tool.name: tool.id for tool in persona.tools\n            if new_msg_req.allowed_tool_ids is None or tool.id in new_msg_req.allowed_tool_ids\n        })\n',
    )
)

marker = "    chat_history_result = convert_chat_history(\n"
insertion = '    if os.environ.get("BURN2_ENABLED") == "true" and persona.name == "Burn 2.0" and user is not None:\n        from onyx.db.burn2_profile import read_profile\n        from onyx.server.query_and_chat.burn2.profile import profile_context, turn_guidance, interview_context\n        statements = [row.message for row in chat_history if row.message_type == MessageType.USER and row.message.strip()]\n        turns = len(statements)\n        context = profile_context(read_profile(user.id))\n        guidance = turn_guidance(turns, message_text)\n        additional_context = "\\n".join(filter(None, [additional_context or new_msg_req.additional_context, context, guidance, interview_context(statements)]))\n\n'
assert p.read_text().count(marker) == 1
p.write_text(p.read_text().replace(marker, insertion + marker))
