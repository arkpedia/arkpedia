/** Hosting role and data channel are separate: a preview can read live data. */
function deploymentRole(env = process.env) {
  const role = env.ARKPEDIA_DEPLOYMENT_ROLE || 'production';
  if (!['staging', 'production'].includes(role)) throw new Error('Invalid deployment role');
  return role;
}
module.exports = { deploymentRole };
