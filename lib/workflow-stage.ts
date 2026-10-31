import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib/core';
import { WorkflowStack } from './workflow-stack';

export interface WorkflowStageProps extends cdk.StageProps {
  readonly alertEmail?: string;
}

/** Deployable unit used by the pipeline. */
export class WorkflowStage extends cdk.Stage {
  public readonly stateMachineArn: cdk.CfnOutput;

  constructor(scope: Construct, id: string, props: WorkflowStageProps = {}) {
    super(scope, id, props);
    const stack = new WorkflowStack(this, 'WorkflowStack', { alertEmail: props.alertEmail });
    this.stateMachineArn = stack.stateMachineArn;
  }
}
