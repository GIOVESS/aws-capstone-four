import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib/core';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';

export interface WorkflowProps {
  readonly taskFunction: lambda.IFunction;
}

/**
 * Prepare Input (Pass) -> Retrieve Config From SSM (Lambda, retries + catch) -> Config Valid? (Choice)
 *   success: Workflow Succeeded
 *   failure: Handle Failure (Pass) -> Workflow Failed
 */
export class Workflow extends Construct {
  public readonly stateMachine: sfn.StateMachine;

  constructor(scope: Construct, id: string, props: WorkflowProps) {
    super(scope, id);

    const prepare = new sfn.Pass(this, 'Prepare Input', {
      comment: 'Adds workflow metadata and keeps the caller input',
      result: sfn.Result.fromObject({ workflow: 'capstone-4', stage: 'start' }),
      resultPath: '$.meta',
    });

    const readConfig = new tasks.LambdaInvoke(this, 'Retrieve Config From SSM', {
      lambdaFunction: props.taskFunction,
      outputPath: '$.Payload',
    });

    // Retry transient failures with exponential backoff: 2s, 4s
    readConfig.addRetry({
      errors: ['States.TaskFailed'],
      interval: cdk.Duration.seconds(2),
      maxAttempts: 2,
      backoffRate: 2,
    });

    // Anything still failing goes to a handler instead of crashing the execution
    const handleFailure = new sfn.Pass(this, 'Handle Failure', {
      comment: 'Records the error details before failing the execution',
      parameters: { status: 'Failed', 'details.$': '$.error' },
    });
    const failed = new sfn.Fail(this, 'Workflow Failed', {
      error: 'ConfigRetrievalFailed',
      cause: 'The task failed after all retries. See the execution event history.',
    });
    readConfig.addCatch(handleFailure.next(failed), {
      errors: ['States.ALL'],
      resultPath: '$.error',
    });

    const succeeded = new sfn.Succeed(this, 'Workflow Succeeded');
    const invalid = new sfn.Fail(this, 'Invalid Config', {
      error: 'InvalidConfig',
      cause: 'The task output did not contain a greeting',
    });
    const configValid = new sfn.Choice(this, 'Config Valid?')
      .when(
        sfn.Condition.and(
          sfn.Condition.isPresent('$.greeting'),
          sfn.Condition.stringEquals('$.status', 'Success'),
        ),
        succeeded,
      )
      .otherwise(invalid);

    const logGroup = new logs.LogGroup(this, 'Logs', {
      logGroupName: '/aws/vendedlogs/states/capstone4-workflow',
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    this.stateMachine = new sfn.StateMachine(this, 'StateMachine', {
      definitionBody: sfn.DefinitionBody.fromChainable(prepare.next(readConfig).next(configValid)),
      stateMachineType: sfn.StateMachineType.STANDARD,
      timeout: cdk.Duration.minutes(5),
      tracingEnabled: true,
      logs: { destination: logGroup, level: sfn.LogLevel.ALL, includeExecutionData: true },
    });
  }
}
