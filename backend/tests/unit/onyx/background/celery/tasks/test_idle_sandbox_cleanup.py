from unittest.mock import MagicMock

import pytest
from kubernetes import config

from onyx.background.celery.tasks.build import tasks
from onyx.server.features.build.configs import SandboxBackend
from onyx.server.features.build.sandbox import factory


@pytest.mark.parametrize("has_running_sandbox", [False, True])
def test_idle_sweep_requires_backend_only_for_running_sandboxes(
    monkeypatch: pytest.MonkeyPatch, has_running_sandbox: bool
) -> None:
    """Replay ONYX-5's task-to-Kubernetes failure without a live cluster."""
    redis = MagicMock()
    redis.lock.return_value.acquire.return_value = True
    redis.lock.return_value.owned.return_value = True
    monkeypatch.setattr(tasks, "get_redis_client", lambda **_kwargs: redis)
    monkeypatch.setattr(tasks, "get_session_with_current_tenant", MagicMock())
    monkeypatch.setattr(
        tasks,
        "get_running_sandboxes",
        lambda _session: [object()] if has_running_sandbox else [],
    )
    monkeypatch.setattr(factory, "_sandbox_manager_instance", None)
    monkeypatch.setattr(factory, "SANDBOX_BACKEND", SandboxBackend.KUBERNETES)
    error = config.ConfigException("Invalid kube-config file. No configuration found.")
    monkeypatch.setattr(config, "load_incluster_config", MagicMock(side_effect=error))
    monkeypatch.setattr(config, "load_kube_config", MagicMock(side_effect=error))

    if has_running_sandbox:
        with pytest.raises(
            RuntimeError, match="Failed to load Kubernetes configuration"
        ):
            tasks.cleanup_idle_sandboxes_task.run(tenant_id="test-tenant")
    else:
        tasks.cleanup_idle_sandboxes_task.run(tenant_id="test-tenant")

    redis.lock.return_value.release.assert_called_once_with()
