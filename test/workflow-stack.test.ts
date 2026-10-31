import * as cdk from 'aws-cdk-lib/core';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { DEFAULT_GREETING } from '../lib/config';
import { WorkflowStack } from '../lib/workflow-stack';

function build(props: { alertEmail?: string } = {}) {
  const app = new cdk.App();
  const stack = new WorkflowStack(app, 'TestStack', props);
  return Template.fromStack(stack);
}

describe('WorkflowStack', () => {
  const template = build();

  test('defines the SSM parameter', () => {
    template.hasResourceProperties('AWS::SSM::Parameter', {
      Name: '/app/config/greeting',
      Type: 'String',
      Value: DEFAULT_GREETING, // follows lib/config.ts, so changing the greeting never breaks the test
    });
  });

  test('Lambda is Python 3.12, traced, and knows the parameter name', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      Runtime: 'python3.12',
      Handler: 'index.handler',
      TracingConfig: { Mode: 'Active' },
      // the parameter name is a Ref to the SSM resource, so it can never drift from it
      Environment: { Variables: Match.objectLike({ PARAMETER_NAME: { Ref: Match.stringLikeRegexp('ConfigGreeting') } }) },
    });
  });

  test('Lambda role can read only the SSM parameter', () => {
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: Match.arrayWith(['ssm:GetParameter']),
            Effect: 'Allow',
          }),
        ]),
      },
    });
    const policies = template.findResources('AWS::IAM::Policy');
    const ssmStatements = Object.values(policies)
      .flatMap((p: any) => p.Properties.PolicyDocument.Statement)
      .filter((s: any) => JSON.stringify(s.Action).includes('ssm:'));
    expect(ssmStatements).toHaveLength(1);
    expect(JSON.stringify(ssmStatements[0].Resource)).toContain('parameter');
    expect(JSON.stringify(ssmStatements[0].Resource)).not.toBe('"*"');
  });

  test('state machine has Pass, Task, Choice, retries and a catch handler', () => {
    const [machine] = Object.values(template.findResources('AWS::StepFunctions::StateMachine')) as any[];
    const definition = JSON.stringify(machine.Properties.DefinitionString);
    for (const expected of [
      'Prepare Input',
      'Retrieve Config From SSM',
      'Config Valid?',
      'Handle Failure',
      'Workflow Succeeded',
      'Workflow Failed',
      '\\"Retry\\"',
      '\\"Catch\\"',
      'States.TaskFailed',
      'States.ALL',
    ]) {
      expect(definition).toContain(expected);
    }
    expect(machine.Properties.TracingConfiguration).toEqual({ Enabled: true });
    expect(machine.Properties.LoggingConfiguration.Level).toBe('ALL');
  });

  test('alarms exist for failed executions and Lambda errors', () => {
    template.resourceCountIs('AWS::CloudWatch::Alarm', 2);
    template.hasResourceProperties('AWS::CloudWatch::Alarm', { MetricName: 'ExecutionsFailed' });
    template.hasResourceProperties('AWS::CloudWatch::Alarm', { MetricName: 'Errors' });
  });

  test('no email subscription unless an address is provided', () => {
    template.resourceCountIs('AWS::SNS::Subscription', 0);
    const withEmail = build({ alertEmail: 'ops@example.com' });
    withEmail.hasResourceProperties('AWS::SNS::Subscription', {
      Protocol: 'email',
      Endpoint: 'ops@example.com',
    });
  });

  test('exports the outputs the pipeline needs', () => {
    template.hasOutput('StateMachineArn', {});
    template.hasOutput('ParameterName', { Value: { Ref: Match.stringLikeRegexp('ConfigGreeting') } });
  });
});
