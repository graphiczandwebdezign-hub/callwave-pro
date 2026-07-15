# GitHub CLI - Installed & Ready ✅

`gh` version 2.96.0 is now installed on this machine.

## 1. Authenticate (pick one)

### Option A: Browser - one time code (Easiest)
```bash
gh auth login
# Choose:
# - GitHub.com
# - HTTPS
# - Yes to authenticate git
# - Login with a web browser -> it gives you a one-time code like XXXX-XXXX
# Open https://github.com/login/device and paste code
```

### Option B: With Personal Access Token (PAT)
1. Create PAT at https://github.com/settings/tokens/new
   - Classic token, scopes: `repo`, `workflow`, `write:packages`
2. Then:
```bash
echo "YOUR_TOKEN" | gh auth login --with-token
# OR
gh auth login --with-token < mytoken.txt
```

Check:
```bash
gh auth status
```

## 2. Create GitHub repo + push this project (One command)

After auth, from ~/voiceapp:

```bash
cd ~/voiceapp
gh repo create callwave-hd-voice --public --source=. --remote=origin --push
```

What it does:
- Creates https://github.com/YOUR_USERNAME/callwave-hd-voice
- Adds remote `origin`
- Pushes `main` branch

If you want private:
```bash
gh repo create callwave-hd-voice --private --source=. --remote=origin --push
```

## 3. Other useful gh commands for this project

```bash
# View repo in browser
gh repo view --web

# Create an issue
gh issue create --title "Add TURN server" --body "Need coturn for better NAT traversal"

# Clone elsewhere
gh repo clone YOUR_USERNAME/callwave-hd-voice

# Make a release
gh release create v1.0.0 --title "CallWave v1.0 HD Voice" --notes "Initial HD voice + voicemail"

# Check repo status
gh repo view
```

## Current Local Repo
```
Branch: main
Commits: 3
 - 79cdd08 chore: add push_to_github helper
 - 1713d72 chore: GitHub CI + LICENSE
 - a6af442 feat: initial commit
Remote: not yet set (will be set by gh repo create)
```

## Quick Start After Auth
```bash
gh auth login
gh auth status
cd ~/voiceapp
gh repo create callwave-hd-voice --public --source=. --remote=origin --push
```
