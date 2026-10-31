import * as path from 'path';
import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib/core';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as ssm from 'aws-cdk-lib/aws-ssm';

export interface ConfigReaderFunctionProps {
  readonly parameter: ssm.IStringParameter;
}

/** Lambda that reads one SSM parameter at runtime. Read access is limited to that parameter. */
export class ConfigReaderFunction extends Construct {
  public readonly function: lambda.Function;

  constructor(scope: Construct, id: string, props: ConfigReaderFunctionProps) {
    super(scope, id);

    const logGroup = new logs.LogGroup(this, 'Logs', {
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    this.function = new lambda.Function(this, 'Function', {
      description: 'Workflow task: retrieves configuration from SSM Parameter Store',
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '..', '..', 'lambda')),
      timeout: cdk.Duration.seconds(10),
      memorySize: 128,
      tracing: lambda.Tracing.ACTIVE,
      logGroup,
      environment: {
        PARAMETER_NAME: props.parameter.parameterName,
        LOG_LEVEL: 'INFO',
      },
    });

    // Least privilege: ssm:GetParameter(s) on this one parameter only
    props.parameter.grantRead(this.function);
  }
}
