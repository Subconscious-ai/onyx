"""Root conftest — shared fixtures available to all test directories."""

import os

# Never report test-process errors to Sentry. Importing `onyx.main` builds the
# FastAPI app at module import time, which calls `init_sentry` whenever
# SENTRY_DSN is set — so a developer shell/.env exporting a real DSN would ship
# expected no-DB unit-test failures (e.g. "Engine not initialized") to a
# production Sentry project. Clear it before any onyx/shared_configs import.
os.environ.pop("SENTRY_DSN", None)

import shared_configs.configs as _shared_configs  # noqa: E402

# Belt-and-braces in case shared_configs was imported before this conftest.
_shared_configs.SENTRY_DSN = None

from collections.abc import Generator  # noqa: E402

import pytest  # noqa: E402

from onyx.utils.variable_functionality import (  # noqa: E402
    fetch_versioned_implementation,
    global_version,
)


@pytest.fixture()
def enable_ee() -> Generator[None, None, None]:
    """Temporarily enable EE mode for a single test.

    Restores the previous EE state and clears the versioned-implementation
    cache on teardown so state doesn't leak between tests.
    """
    was_ee = global_version.is_ee_version()
    global_version.set_ee()
    fetch_versioned_implementation.cache_clear()
    yield
    if not was_ee:
        global_version.unset_ee()
    fetch_versioned_implementation.cache_clear()
