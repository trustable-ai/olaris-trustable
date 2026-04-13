Create the file doctor.ts run by bun, as a file with no dependencies,
uses docker and kubectl on the path.
Must work cross-platform on macOS, Linux and Windows.

The doctor must be resilient to failures: every individual check must be wrapped so that if it throws or times out, the error is recorded and the doctor continues with the remaining checks. The report file must always be produced, even if most checks fail. Never abort early — record the failure and move on.

Perform the following checks to detect errors
and provide detailed informations on the errors

# Prereq

- check docker is in path (`which` on Unix, `where` on Windows)
- check docker is up and running
- check docker call pull images: execute commands and access the internet:
 pulling a curl image that curl http://google.com and verify there is an html answer and a Location redirects
- check there is an image ollama running
- check there is an a nvuolaris-control-plane image running

# Ports
- read the Nuvolaris apihost from `cm/config .metadata.annotations.apihost`
- derive the Trustable hosts from that apihost:
  `trustable.<domain>`, `opencode.<domain>`, and `vite.<domain>`
- allow `TRUSTABLE_DOMAIN`, `TRUSTABLE_HOST`, `OPENCODE_HOST`, `VITE_HOST`, and
  `TRUSTABLE_EXPECTED_IP` to override the derived diagnostics
- check the derived hosts resolve to the same target as the apihost, so
  `192.168.1.124.nip.io` expects `192.168.1.124` while `miniops.me` can keep
  resolving to `127.0.0.1`
  - Unix: `dig +short <host>`
  - Windows: PowerShell `Resolve-DnsName`
- check http://localhost:11434 returns Ollama is running
- check `<cluster-apihost>/api/info` returns a json and `.description` is OpenWhisk
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
  - Terminating: show how long the pod has been terminating and if finalizers are blocking

# Reporting

At the end of the anomaly section, if any pods have restart count > 0, add a note: "Note: found <count> restarts" listing the pods and their restart counts. This is informational, not an anomaly.

Save the entire report in a file `trustable-doctor.txt`. If the environment variable `$OPS_PWD` is set, save it in the `$OPS_PWD` folder; otherwise save it in the current directory. The report must include the system info, all check results, the logs of trustable-0, nuvolaris-operator-0, controller-0, and any anomaly logs (the same content that would be posted as GitHub issue and comments). Print the full path where the report was saved: `trustable doctor report saved in <full path>`.

After investigations,  ask the user if he wants to report problems or success filing an issue. Use the message "Would you like to file a report on GitHub to report Success/Failute"

If the user confirms, open an an issue using
https://nuvolaris.org/api/v1/web/landing/v1/issue

do a post with a json with
{
    "open": "<Result> for <output of `hostname`> running <output of `uname -a` (Unix) or PowerShell OSVersion (Windows)>"
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

Add logs as separate comments. Each comment is posted via:
{
    "comment": <issue number>
    "body": <comment>
}

Post one comment per log source:
- the log of trustable-0
- the log of nuvolaris-operator-0
- the log of controller-0
- the log of any anomaly detected

If a single comment would exceed 65000 characters, split it into multiple sequential comments of at most 65000 characters each, splitting at line boundaries. Label each chunk with a part number, e.g. "Part 1/3", "Part 2/3", etc.

Format of each comment (or chunk):

# <description> (Part N/M)
```
<logs chunk>
```

# Support Community

At the very end of the doctor (after all reporting and issue filing), always print:

```
Join our support community at https://n7s.co/wa-trustable
```

Then fetch `https://qrenco.de/n7s.co/wa-trustable` and print the response body to the terminal as-is (it renders a QR code in ASCII art).
