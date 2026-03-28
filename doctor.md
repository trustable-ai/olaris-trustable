Create the file doctor.ts run by bun,  as a file file with no dependencies,
uses docker, kubectl and coreutils on the path

perform the following checks to detect errors
and provide detailed informations on the errors

# Prereq

- check you have at least 16gb and 30gb of disk
- check docker is in path
- check docker is up and running
- check docker call pull images: execute commands and access the internet:
 pulling a curl image that curl http://google.com and verify there is an html answer and a Location redirects
- check there is an image ollama running
- check there is an a nvuolaris-control-plane image running

# Ports
- check miniops.me, trustable.miniops.me, opencode.miniops.me and vite.miniops.me returns 127.0.0.1
- check http://localhost:11434 returns Ollama is running
- check http://miniops.me/api/info returns a json and .description is OpenWhisk
- check connecting to localhost 2222 what returns starts with SSH

# Kubernetes using kubectl
- check there is a node nuvolaris-control-plane
- check there is a namespace nuvolaris
- check all the pods in namespace nuvolaris and verify they are all Running or Completed
- check there are the following pods running:

- controller-0
- couchdb-0
- nuvolaris-etcd-0
- nuvolaris-mongodb-0
- nuvolaris-operator-0
- nuvolaris-postgres-1-0
- nuvolaris-static-0
- nuvolaris-streamer-api-0
- nuvolaris-system-api-0
- redis-0
- registry-0
- seaweedfs-0
- trustable-0
- kubegres-controller-manager-*
- nuvolaris-milvus-standalone-*

and there are those completed jobs:

- couchdb-init-*
- cron-init-*
- preload-runtimes-*

# Anomaly Detection

- detect anomalies on pods and extracts info on the anomalies with describe and logs:
  - Pending: pod accepted but containers not yet running (scheduling, resource constraints)
  - Failed: all containers terminated with at least one failure
  - Unknown: pod state cannot be determined (node communication failure)
  - CrashLoopBackOff: container keeps crashing and kubelet is backing off restarts
  - ImagePullBackOff / ErrImagePull: cannot pull the container image
  - CreateContainerConfigError: bad config (missing ConfigMap/Secret, etc.)
  - OOMKilled: container killed for exceeding memory limits
  - Error: container exited with a non-zero exit code
  - Restart count > 0: container has restarted even if currently Running
  - Not Ready: pod is running but readiness probe is failing
  - Evicted: pod was evicted due to node pressure
  - Terminating: pod stuck in terminating state

- if you find anomalies, gather details:
  - ImagePullBackOff / ErrImagePull: check which image is not pulled, inform and try to pull with a docker command, reporting the result
  - CrashLoopBackOff: extract the logs of the failing pod using --previous
  - CreateContainerConfigError: extract the yaml of the config
  - OOMKilled: show the memory limits and last termination reason
  - Pending: describe the pod to show scheduling issues or unmet resource requests
  - Failed / Error: extract the logs of the failing container
  - Evicted: show the eviction reason from pod status
  - Not Ready: show readiness probe config and recent events
  - Restart count > 0: show last termination reason and restart count
  - Terminating: show how long the pod has been terminating and if finalizers are blocking

# Reporting

After investigations,  ask the user if he wants to report problems or success filing an issue. Use the message "Would you like to file a report on GitHub to report Success/Failute"

If the user confirms, open an an issue using
https://nuvolaris.org/api/v1/web/landing/v1/issue

do a post with a json with
{
    "open": "<Result> for <output of `coreutils hostname`> running <output of `coreutils uname -a`>"
    "body": <initial assessment>
}

with <Result> either Success or Failure

The <initial assessemnt> is:

- Trustable images in  ~/.ops/olaris-trustable/opsroot.json
- ops -info
- the docker version
- the kubernetes version
- all the checks performed and the results

It returns a json with number and the url

Add  as a separate comment
{
    "comment": <issue number>
    "body": <comment>
}

- the log of trustable-0
- the log of nuvolaris-operator-0
- the log of controller-0
- the log of any anomaly detected

Format of comments:

# <description>
```
<logs>
```

