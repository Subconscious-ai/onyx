"""In-memory stand-in for the Redis commands MCP approvals use."""


class FakeRedis:
    """The few Redis commands the approval uses, in memory."""

    def __init__(self) -> None:
        self.store: dict[str, str] = {}

    def set(
        self, key: str, value: str, nx: bool = False, ex: int | None = None
    ) -> bool | None:
        del ex
        if nx and key in self.store:
            return None
        self.store[key] = value
        return True

    def get(self, key: str) -> str | None:
        return self.store.get(key)

    def delete(self, *keys: str) -> int:
        return sum(self.store.pop(key, None) is not None for key in keys)
