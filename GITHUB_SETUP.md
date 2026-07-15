# GitHub Setup — CallWave

Your local git repo is already initialized and committed (branch `main`).

### Option 1: Create GitHub repo via Web (Easiest)

1. Go to https://github.com/new
2. Repo name: `callwave-hd-voice` (or your choice)
3. Set Public/Private, **DO NOT** initialize with README (we already have one)
4. Click **Create repository**
5. Copy the remote commands GitHub shows, then run in your terminal:

```bash
cd ~/voiceapp
# replace USERNAME and REPONAME:
git remote add origin https://github.com/USERNAME/REPONAME.git
git branch -M main
git push -u origin main
```

### Option 2: Using GitHub CLI (if you install `gh`)

```bash
# Auth first:
gh auth login

# Create and push in one step:
cd ~/voiceapp
gh repo create callwave-hd-voice --public --source=. --remote=origin --push
```

### Current local status

```bash
git log --oneline
git remote -v
```

### What's included for GitHub
- ✅ `.gitignore` (ignores node_modules, uploads, store.json)
- ✅ MIT LICENSE
- ✅ `.github/workflows/ci.yml` — CI that verifies build on every push
- ✅ README with install docs
- ✅ data/.gitkeep and public/uploads/.gitkeep to keep empty folders

### Next after pushing
- Enable GitHub Pages if you want static demo
- Add Secrets for deployment (FLY_API_TOKEN, etc) if deploying to Fly.io / Render
- Protect `main` branch, add PR template

### Quick commands

```bash
# Make changes, then:
git add -A
git commit -m "feat: your message"
git push

# Pull latest:
git pull origin main
```
