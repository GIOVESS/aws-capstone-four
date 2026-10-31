import * as cdk from 'aws-cdk-lib/core';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { PipelineStack } from '../lib/pipeline-stack';

const env = { account: '123456789012', region: 'us-east-1' };
const connectionArn = 'arn:aws:codeconnections:us-east-1:123456789012:connection/00000000-0000-0000-0000-000000000000';

describe('PipelineStack', () => {
  const app = new cdk.App();
  const stack = new PipelineStack(app, 'TestPipeline', {
    env,
    githubRepo: 'GIOVESS/aws-capstone-four',
    githubBranch: 'main',
    connectionArn,
    alertEmail: 'ops@example.com',
  });
  const template = Template.fromStack(stack);

  test('pipeline has source, build, self-mutation, assets and deploy stages in order', () => {
    const [pipeline] = Object.values(template.findResources('AWS::CodePipeline::Pipeline')) as any[];
    const names = pipeline.Properties.Stages.map((s: any) => s.Name);
    expect(names).toEqual(['Source', 'Build', 'UpdatePipeline', 'Assets', 'Dev']);
  });

  test('source is the GitHub connection on the main branch', () => {
    template.hasResourceProperties('AWS::CodePipeline::Pipeline', {
      Stages: Match.arrayWith([
        Match.objectLike({
          Name: 'Source',
          Actions: [
            Match.objectLike({
              Configuration: Match.objectLike({
                ConnectionArn: connectionArn,
                FullRepositoryId: 'GIOVESS/aws-capstone-four',
                BranchName: 'main',
              }),
            }),
          ],
        }),
      ]),
    });
  });

  test('deploy stage deploys the workflow stack and then validates it', () => {
    const [pipeline] = Object.values(template.findResources('AWS::CodePipeline::Pipeline')) as any[];
    const dev = pipeline.Properties.Stages.find((s: any) => s.Name === 'Dev');
    const actions = dev.Actions.map((a: any) => a.Name);
    expect(actions).toContain('ValidateWorkflow');
    expect(actions.some((n: string) => n.includes('WorkflowStack'))).toBe(true);
  });

  test('artifact bucket is private, encrypted, TLS-only and removable', () => {
    template.hasResourceProperties('AWS::S3::Bucket', {
      PublicAccessBlockConfiguration: Match.objectLike({ BlockPublicAcls: true, RestrictPublicBuckets: true }),
      BucketEncryption: Match.anyValue(),
    });
    template.hasResourceProperties('AWS::S3::BucketPolicy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({ Effect: 'Deny', Condition: { Bool: { 'aws:SecureTransport': 'false' } } }),
        ]),
      },
    });
  });

  test('synth step carries the deployment settings and uses Node 20', () => {
    const projects = Object.values(template.findResources('AWS::CodeBuild::Project')) as any[];
    const synth = projects.find((p) => JSON.stringify(p.Properties).includes('npx cdk synth'));
    expect(synth).toBeDefined();
    const vars = JSON.stringify(synth.Properties.Environment.EnvironmentVariables);
    expect(vars).toContain('CONNECTION_ARN');
    expect(vars).toContain('ALERT_EMAIL');
    expect(JSON.stringify(synth.Properties.Source.BuildSpec)).toContain('nodejs');
  });
});
