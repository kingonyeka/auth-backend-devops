# AWS Setup & Troubleshooting Notes

Log of the manual AWS IAM + EC2 setup performed before introducing Terraform. Kept as a reference for what each step does, and as a record of real issues hit and how they were diagnosed — useful both for repeating this later and for interview talking points.

---

## 1. Account & IAM Setup

### Root bootstrap (one-time only)

- Logged in with root **once**, solely to create the first IAM user (unavoidable — IAM users don't exist yet on a fresh account, so root has to create the first one).
- Enabled MFA on the root account immediately after login.
- After this, root was never used again for day-to-day work.

### IAM admin user

- Created an IAM user (`lee-admin`) with `AdministratorAccess` attached.
- Enabled MFA on this user separately from root.
- Created a CLI access key (Access Key ID + Secret Access Key) for programmatic access.

### AWS CLI configuration

```bash
aws configure --profile personal
```

- Region: `us-east-1`
- Output format: `json`
- Verified identity with:

```bash
aws sts get-caller-identity --profile personal
```

Confirms the CLI is authenticated as the IAM user (Arn ending in `/lee-admin`), not root.

**Note:** access keys were regenerated more than once during this session after being visible in shared terminal screenshots. Standard practice — treat any key that's been exposed as compromised and rotate immediately.

---

## 2. Manual EC2 Provisioning

Every step below was run manually via the AWS CLI (not Terraform) specifically to understand what each piece of infrastructure actually does before automating it.

| Step | Command                                                              | Purpose                                                                        |
| ---- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 1    | `aws ec2 create-key-pair`                                            | Generates an SSH key pair; AWS keeps the public half, returns the private half |
| 2    | `aws ec2 describe-vpcs`                                              | Finds the account's default VPC                                                |
| 3    | `aws ec2 describe-subnets`                                           | Finds a subnet inside that VPC                                                 |
| 4    | `curl ifconfig.me`                                                   | Gets local public IP, to scope SSH access                                      |
| 5    | `aws ec2 create-security-group` + `authorize-security-group-ingress` | Creates a firewall and opens port 22 to just this IP                           |
| 6    | `aws ec2 describe-images`                                            | Finds the latest Amazon Linux 2023 AMI                                         |
| 7    | `aws ec2 run-instances`                                              | Launches the actual t3.micro instance                                          |
| 8    | `aws ec2 wait instance-running`                                      | Blocks until the instance is fully up                                          |
| 9    | `aws ec2 describe-instances`                                         | Retrieves the instance's public IP                                             |
| 10   | `ssh -i <key>.pem ec2-user@<ip>`                                     | Connects to the instance                                                       |
| 11   | `aws ec2 terminate-instances`                                        | Tears the instance down when done (avoid ongoing charges)                      |

---

## 3. Issues Hit & How They Were Debugged

### Issue 1 — SSH connection timed out

```
ssh: connect to host <ip> port 22: Connection timed out
```

**Cause:** Public IP had changed between running `curl ifconfig.me` and attempting SSH — common on networks using CGNAT (Carrier-Grade NAT), where an ISP shares one public IP across many customers and it can shift between connections.

**Diagnosis:**

- Re-ran `curl ifconfig.me` and compared to the IP used in the security group rule — they didn't match.
- Confirmed by temporarily widening the security group rule to `0.0.0.0/0` — SSH connected immediately, proving it was an IP/network issue, not an AWS misconfiguration.

**Fix:** Added a fresh `authorize-security-group-ingress` rule with the current IP. Reverted the temporary `0.0.0.0/0` rule once confirmed.

**Takeaway:** On networks with CGNAT, expect to re-check and re-authorize your IP each session — this is exactly the kind of friction Terraform + a slightly wider trusted CIDR range (or a bastion/SSM Session Manager setup) solves at scale.

---

### Issue 2 — Corrupted private key file ("invalid format" / "unsupported" libcrypto errors)

```
Load key "auth-system-key.pem": error in libcrypto: unsupported
Load key "auth-system-key.pem": invalid format
```

**Cause:** The key was originally saved using PowerShell's `>` redirect:

```powershell
aws ec2 create-key-pair ... --output text > auth-system-key.pem
```

PowerShell's default redirect encodes output as **UTF-16 with a byte-order mark (BOM)**, not plain ASCII/UTF-8. A `.pem` file must be plain text — SSH clients (both Git Bash's OpenSSH build and, in one case, the file itself) rejected it as malformed.

**Diagnosis:**

- Tried the key from both Git Bash and native Windows/PowerShell SSH clients — both failed, but with _different_ error messages (`unsupported` vs `invalid format`), which pointed to the file itself being bad rather than a single client's bug.
- Attempted to fix in place with `ssh-keygen -p -m PEM`, which also failed to load the file — confirming corruption, not just a format mismatch.

**Fix:**

1. Deleted the broken key pair from AWS (`aws ec2 delete-key-pair`) and the local file.
2. Regenerated the key pair, this time piping output through `Out-File -Encoding ascii` (PowerShell) — or, more simply, using Git Bash's `>` redirect, which writes plain UTF-8 by default.
3. Verified the new file started with `-----BEGIN RSA PRIVATE KEY-----` before using it.
4. Since a key pair is only attached to an instance at launch, terminated the old instance and relaunched with the corrected key.

**Takeaway:** Never trust a shell's default text redirect for binary-sensitive or format-sensitive files on Windows — PowerShell and Git Bash encode differently by default, and this is a common, repeatable gotcha for anyone scripting AWS CLI output on Windows.

---

### Issue 3 — `describe-instances` returned a stale/terminated instance

```
aws: [ERROR]: Waiter InstanceRunning failed: Waiter encountered a terminal
failure state: For expression "Reservations[].Instances[].State.Name" we
matched expected path: "terminated" at least once
```

**Cause:** Relaunching a new instance with the same `Name` tag (`auth-system-staging`) as a previously terminated one meant `describe-instances --filters Name=tag:Name,...` matched _both_ instances — and returned the terminated one first.

**Fix:** Added an explicit state filter to exclude terminated instances:

```bash
aws ec2 describe-instances \
  --filters "Name=tag:Name,Values=auth-system-staging" \
            "Name=instance-state-name,Values=running,pending" \
  --query 'Reservations[0].Instances[0].InstanceId' --output text
```

**Takeaway:** Tag-based lookups aren't unique by default — always scope by instance state (or use a truly unique tag per launch) when relaunching under the same name.

---

## 4. Result

Successfully connected to a live EC2 instance and confirmed shell access:

```bash
whoami        # ec2-user
cat /etc/os-release   # Amazon Linux 2023
df -h
free -h
```

Instance terminated afterward to avoid ongoing charges.

---

## 5. Next Steps

- Recreate this same setup declaratively using **Terraform** (`terraform/environments/dev`), referencing the manual steps above 1:1 as a learning bridge.
- Move `.pem` / private key handling out of ad-hoc shell redirects entirely — Terraform will manage the key pair resource directly.
- Eventually replace direct SSH (port 22 open to an IP) with **AWS Systems Manager Session Manager**, removing the need to manage SSH keys or open port 22 at all.
