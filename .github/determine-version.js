module.exports = async function (core, context, github) {
  const iterator = github.paginate.iterator(github.rest.repos.listReleases, {
    owner: context.repo.owner,
    repo: context.repo.repo,
    per_page: 100
  });

  let minor = 1;
  const now = new Date();
  for await (const { data: releases } of iterator) {
    const relevantReleases = releases.filter(x => x.publishedAt.getFullYear() === now.getFullYear() && !draft);
    if (relevantReleases.length === 0) break;

    minor += relevantReleases.length;
  }

  core.info(`::set-output version=${now.getFullYear()}.${minor}`);
}
