import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib/core';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as pipelines from 'aws-cdk-lib/pipelines';
import { WorkflowStage } from './workflow-stage';

export interface PipelineStackProps extends cdk.StackProps {
  readonly githubRepo: string;
  readonly githubBranch: string;
  /** ARN of an AVAILABLE GitHub connection (CodeConnections). */
  readonly connectionArn: string;
  readonly alertEmail?: string;
  /** Pin the CDK CLI used inside the pipeline so it matches the library version. */
  readonly cliVersion?: string;
}

/**
 * Self-mutating CDK Pipeline.
 * Source (GitHub) -> Build (synth + tests) -> UpdatePipeline -> Assets -> Dev (deploy + validate)
 */
export class PipelineStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: PipelineStackProps) {
    super(scope, id, props);

    // Own the artifact bucket so `cdk destroy` removes it cleanly
    const artifactBucket = new s3.Bucket(this, 'ArtifactBucket', {
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const source = pipelines.CodePipelineSource.connection(props.githubRepo, props.githubBranch, {
      connectionArn: props.connectionArn,
    });

    const pipeline = new pipelines.CodePipeline(this, 'Pipeline', {
      cliVersion: props.cliVersion,
      codePipeline: new codepipeline.Pipeline(this, 'CodePipeline', {
        pipelineName: 'workflow-cdk-pipeline',
        artifactBucket,
        crossAccountKeys: false,
        restartExecutionOnUpdate: true,
      }),
      synth: new pipelines.ShellStep('Synth', {
        input: source,
        // Non-secret deployment settings travel with the pipeline, not the repository
        env: {
          CONNECTION_ARN: props.connectionArn,
          GITHUB_REPO: props.githubRepo,
          GITHUB_BRANCH: props.githubBranch,
          ALERT_EMAIL: props.alertEmail ?? '',
        },
        commands: ['npm ci', 'npm run build', 'npm test', 'npx cdk synth'],
      }),
      codeBuildDefaults: {
        buildEnvironment: { buildImage: codebuild.LinuxBuildImage.STANDARD_7_0 },
        partialBuildSpec: codebuild.BuildSpec.fromObject({
          phases: { install: { 'runtime-versions': { nodejs: '20' } } },
        }),
      },
    });

    const dev = new WorkflowStage(this, 'Dev', { env: props.env, alertEmail: props.alertEmail });
    const region = cdk.Stack.of(this).region;
    const account = cdk.Stack.of(this).account;

    pipeline.addStage(dev, {
      post: [
        // Real end-to-end check: start the deployed state machine and require SUCCEEDED
        new pipelines.CodeBuildStep('ValidateWorkflow', {
          input: source,
          envFromCfnOutputs: { STATE_MACHINE_ARN: dev.stateMachineArn },
          commands: ['bash scripts/validate_workflow.sh'],
          rolePolicyStatements: [
            new iam.PolicyStatement({
              actions: ['states:StartExecution'],
              resources: [`arn:aws:states:${region}:${account}:stateMachine:*`],
            }),
            new iam.PolicyStatement({
              actions: ['states:DescribeExecution'],
              resources: [`arn:aws:states:${region}:${account}:execution:*:*`],
            }),
          ],
        }),
      ],
    });
  }
}
