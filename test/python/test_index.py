import sys
from pathlib import Path
from unittest.mock import MagicMock

import pytest
from botocore.exceptions import ClientError

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "lambda"))
import index  # noqa: E402


class Ctx:
    aws_request_id = "req-123"


@pytest.fixture(autouse=True)
def env(monkeypatch):
    monkeypatch.setenv("PARAMETER_NAME", "/app/config/greeting")


def fake_client(value="hello", version=3):
    client = MagicMock()
    client.get_parameter.return_value = {"Parameter": {"Value": value, "Version": version}}
    return client


def test_reads_parameter_and_logs_value(monkeypatch, caplog):
    client = fake_client("Hello from CI/CD!")
    monkeypatch.setattr(index, "_client", lambda: client)
    with caplog.at_level("INFO"):
        out = index.handler({}, Ctx())
    client.get_parameter.assert_called_once_with(Name="/app/config/greeting", WithDecryption=False)
    assert out == {
        "status": "Success",
        "parameter": "/app/config/greeting",
        "greeting": "Hello from CI/CD!",
        "version": 3,
        "requestId": "req-123",
    }
    assert "Retrieved from SSM: /app/config/greeting = Hello from CI/CD!" in caplog.text


def test_ssm_error_becomes_retryable_error(monkeypatch):
    client = MagicMock()
    client.get_parameter.side_effect = ClientError({"Error": {"Code": "ParameterNotFound"}}, "GetParameter")
    monkeypatch.setattr(index, "_client", lambda: client)
    with pytest.raises(index.ConfigUnavailableError, match="ParameterNotFound"):
        index.handler({}, Ctx())


def test_simulated_failure_skips_ssm(monkeypatch):
    client = fake_client()
    monkeypatch.setattr(index, "_client", lambda: client)
    with pytest.raises(index.ConfigUnavailableError):
        index.handler({"simulateFailure": True}, Ctx())
    client.get_parameter.assert_not_called()


def test_uses_parameter_name_from_environment(monkeypatch):
    monkeypatch.setenv("PARAMETER_NAME", "/other/name")
    client = fake_client()
    monkeypatch.setattr(index, "_client", lambda: client)
    index.handler({}, Ctx())
    client.get_parameter.assert_called_once_with(Name="/other/name", WithDecryption=False)
