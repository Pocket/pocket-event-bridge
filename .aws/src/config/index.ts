const name = 'PocketEventBridge';
const domainPrefix = 'pocket-event-bridge';
const isDev = process.env.NODE_ENV === 'development';
const environment = isDev ? 'Dev' : 'Prod';
const domain = isDev
  ? `${domainPrefix}.getpocket.dev`
  : `${domainPrefix}.readitlater.com`;
const githubConnectionArn = isDev
  ? 'arn:aws:codestar-connections:us-east-1:410318598490:connection/7426c139-1aa0-49e2-aabc-5aef11092032'
  : 'arn:aws:codestar-connections:us-east-1:996905175585:connection/5fa5aa2b-a2d2-43e3-ab5a-72ececfc1870';
const branch = isDev ? 'dev' : 'main';

export const config = {
  name,
  isDev,
  domainPrefix,
  prefix: `${name}-${environment}`,
  circleCIPrefix: `/${name}/CircleCI/${environment}`,
  shortName: 'PKT_EB', //change to your service name, limit to 6 characters, match shared-infrastructure short name
  environment,
  domain,
  codePipeline: {
    githubConnectionArn,
    repository: 'pocket/pocket_event_bridge',
    branch,
  },
  tags: {
    service: name,
    environment,
  },
};
