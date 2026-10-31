#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib/core';
import { DEFAULT_BRANCH, DEFAULT_REPO } from '../lib/config';
import { PipelineStack } from '../lib/pipeline-stack';

const app = new cdk.App();

const connectionArn = process.env.CONNECTION_ARN;
if (!connectionArn) {
  throw new Error('CONNECTION_ARN is not set. Export the ARN of an AVAILABLE GitHub connection.');
}

new PipelineStack(app, 'WorkflowPipelineStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? 'us-east-1',
  },
  githubRepo: process.env.GITHUB_REPO || DEFAULT_REPO,
  githubBranch: process.env.GITHUB_BRANCH || DEFAULT_BRANCH,
  connectionArn,
  alertEmail: process.env.ALERT_EMAIL || undefined,
  // Keep in step with the aws-cdk devDependency in package.json
  cliVersion: '2.1145.0',
});
