"""Root conftest — shared fixtures available to all test directories."""

import os

# Keep test runs from reporting to a real Sentry project. ``SENTRY_DSN`` is read
# at import time by ``shared_configs.configs`` and Sentry is initialized as an
# import side effect (e.g. ``onyx.background.celery.apps.app_base``), so a DSN
# exported in a developer shell would otherwise turn expected, asserted errors
# (such as cross-tenant denials) into "production" Sentry events. This must run
# before any ``onyx`` import below. Set ONYX_TEST_ALLOW_SENTRY=true to opt out.
_ALLOW_SENTRY_IN_TESTS = os.environ.get("ONYX_TEST_ALLOW_SENTRY") == "true"
if not _ALLOW_SENTRY_IN_TESTS:
    os.environ.pop("SENTRY_DSN", None)

from collections.abc import Generator  # noqa: E402

import pytest  # noqa: E402

from onyx.utils.variable_functionality import (  # noqa: E402
    fetch_versioned_implementation,
    global_version,
)


def pytest_configure(config: pytest.Config) -> None:  # noqa: ARG001
    """Disable any Sentry client that was already started before collection."""
    if _ALLOW_SENTRY_IN_TESTS:
        return
    try:
        import sentry_sdk
    except ImportError:
        return
    sentry_sdk.init(dsn=None)


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
