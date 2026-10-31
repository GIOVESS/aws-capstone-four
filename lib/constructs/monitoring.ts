import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib/core';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cw_actions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';

export interface MonitoringProps {
  readonly stateMachine: sfn.StateMachine;
  readonly taskFunction: lambda.Function;
  /** Optional. When set, the address is subscribed to alarm notifications. */
  readonly alertEmail?: string;
}

/** Alarms, notifications and a dashboard for the workflow. */
export class Monitoring extends Construct {
  public readonly topic: sns.Topic;

  constructor(scope: Construct, id: string, props: MonitoringProps) {
    super(scope, id);

    this.topic = new sns.Topic(this, 'Alerts');
    if (props.alertEmail) {
      this.topic.addSubscription(new subscriptions.EmailSubscription(props.alertEmail));
    }
    const action = new cw_actions.SnsAction(this.topic);

    const failedExecutions = props.stateMachine.metricFailed({ period: cdk.Duration.minutes(5) });
    new cloudwatch.Alarm(this, 'ExecutionsFailed', {
      alarmDescription: 'A Step Functions execution failed',
      metric: failedExecutions,
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    }).addAlarmAction(action);

    new cloudwatch.Alarm(this, 'LambdaErrors', {
      alarmDescription: 'The workflow task Lambda returned errors',
      metric: props.taskFunction.metricErrors({ period: cdk.Duration.minutes(5) }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    }).addAlarmAction(action);

    const dashboard = new cloudwatch.Dashboard(this, 'Dashboard');
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Step Functions executions',
        left: [
          props.stateMachine.metricStarted(),
          props.stateMachine.metricSucceeded(),
          props.stateMachine.metricFailed(),
        ],
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: 'Lambda invocations and errors',
        left: [props.taskFunction.metricInvocations(), props.taskFunction.metricErrors()],
        width: 12,
      }),
    );
  }
}
