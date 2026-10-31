import { Construct } from 'constructs';
import * as ssm from 'aws-cdk-lib/aws-ssm';

export interface AppConfigProps {
  readonly parameterName: string;
  readonly greeting: string;
}

/** Application configuration stored in SSM Parameter Store. */
export class AppConfig extends Construct {
  public readonly greeting: ssm.StringParameter;

  constructor(scope: Construct, id: string, props: AppConfigProps) {
    super(scope, id);

    this.greeting = new ssm.StringParameter(this, 'Greeting', {
      parameterName: props.parameterName,
      stringValue: props.greeting,
      description: 'Greeting returned by the workflow task Lambda',
      tier: ssm.ParameterTier.STANDARD,
    });
  }
}
