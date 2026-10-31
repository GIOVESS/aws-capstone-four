import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib/core';
import { DEFAULT_GREETING, PARAMETER_NAME } from './config';
import { AppConfig } from './constructs/app-config';
import { ConfigReaderFunction } from './constructs/config-reader-function';
import { Monitoring } from './constructs/monitoring';
import { Workflow } from './constructs/workflow';

export interface WorkflowStackProps extends cdk.StackProps {
  readonly greeting?: string;
  readonly alertEmail?: string;
}

/** SSM parameter + Lambda + Step Functions workflow + monitoring. */
export class WorkflowStack extends cdk.Stack {
  public readonly stateMachineArn: cdk.CfnOutput;

  constructor(scope: Construct, id: string, props: WorkflowStackProps = {}) {
    super(scope, id, props);

    const config = new AppConfig(this, 'Config', {
      parameterName: PARAMETER_NAME,
      greeting: props.greeting ?? DEFAULT_GREETING,
    });

    const reader = new ConfigReaderFunction(this, 'Reader', { parameter: config.greeting });
    const workflow = new Workflow(this, 'Workflow', { taskFunction: reader.function });

    new Monitoring(this, 'Monitoring', {
      stateMachine: workflow.stateMachine,
      taskFunction: reader.function,
      alertEmail: props.alertEmail,
    });

    this.stateMachineArn = new cdk.CfnOutput(this, 'StateMachineArn', {
      value: workflow.stateMachine.stateMachineArn,
    });
    new cdk.CfnOutput(this, 'ParameterName', { value: config.greeting.parameterName });
    new cdk.CfnOutput(this, 'FunctionName', { value: reader.function.functionName });
  }
}
