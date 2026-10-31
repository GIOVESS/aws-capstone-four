#!/usr/bin/env bash
# Pipeline validation step: start the deployed state machine and require SUCCEEDED.
set -euo pipefail

: "${STATE_MACHINE_ARN:?STATE_MACHINE_ARN is not set}"

EXEC_ARN=$(aws stepfunctions start-execution \
  --state-machine-arn "$STATE_MACHINE_ARN" \
  --name "pipeline-validate-$(date +%s)" \
  --input '{"source":"pipeline-validation"}' \
  --query executionArn --output text)
echo "Started $EXEC_ARN"

STATUS=RUNNING
for _ in $(seq 1 40); do
  STATUS=$(aws stepfunctions describe-execution --execution-arn "$EXEC_ARN" --query status --output text)
  echo "status: $STATUS"
  if [ "$STATUS" != "RUNNING" ]; then break; fi
  sleep 5
done

if [ "$STATUS" != "SUCCEEDED" ]; then
  echo "Workflow validation FAILED with status $STATUS" >&2
  aws stepfunctions describe-execution --execution-arn "$EXEC_ARN" --query '[status,error,cause]' --output text >&2 || true
  exit 1
fi

echo "Workflow validation passed. Output:"
aws stepfunctions describe-execution --execution-arn "$EXEC_ARN" --query output --output text
