-- Keep cohort/counter scans on compact covering indexes rather than reading the
-- large archive payloads or sorting every run's JSON summary with its identity.
CREATE INDEX auto_deploy_summary_community ON auto_deploy_summary(userId,namespace,stageId,updatedAt);
CREATE INDEX auto_deploy_community_counters ON auto_deploy(userId,namespace,stageId,fingerprint);
