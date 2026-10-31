"""Workflow task: read a configuration value from SSM Parameter Store at runtime."""
import logging
import os

import boto3
from botocore.exceptions import ClientError

logger = logging.getLogger()
logger.setLevel(os.environ.get("LOG_LEVEL", "INFO"))

_ssm = None


class ConfigUnavailableError(Exception):
    """Raised when the configuration cannot be retrieved. Step Functions retries on it."""


def _client():
    global _ssm
    if _ssm is None:
        _ssm = boto3.client("ssm")
    return _ssm


def handler(event, context):
    name = os.environ.get("PARAMETER_NAME", "/app/config/greeting")
    request_id = getattr(context, "aws_request_id", "local")

    # Lets you demonstrate Retry and Catch: start an execution with {"simulateFailure": true}
    if isinstance(event, dict) and event.get("simulateFailure"):
        logger.error("Simulated failure requested (request %s)", request_id)
        raise ConfigUnavailableError("Simulated failure requested by the caller")

    try:
        response = _client().get_parameter(Name=name, WithDecryption=False)
    except ClientError as exc:
        code = exc.response.get("Error", {}).get("Code", "Unknown")
        logger.error("SSM get_parameter failed for %s: %s", name, code)
        raise ConfigUnavailableError(f"Could not read {name}: {code}") from exc

    parameter = response["Parameter"]
    greeting = parameter["Value"]
    logger.info("Retrieved from SSM: %s = %s (version %s)", name, greeting, parameter.get("Version"))

    return {
        "status": "Success",
        "parameter": name,
        "greeting": greeting,
        "version": parameter.get("Version"),
        "requestId": request_id,
    }
