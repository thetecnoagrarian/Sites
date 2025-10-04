# GitHub Account Mapping

This document defines which GitHub account each project belongs to for proper repository management and deployment.

## Repository to GitHub Account Mapping

| Project Directory | GitHub Account | Repository URL | Purpose |
|------------------|----------------|----------------|---------|
| `fruitionforestgarden/` | `fruitionforestgarden` | `https://github.com/fruitionforestgarden/fruitionforestgarden.git` | Production site for FruitionForestGarden.com |
| `thetecnoagrarian/` | `thetecnoagrarian` | `https://github.com/thetecnoagrarian/thetecnoagrarian.git` | Production site for TheTecnoagrarian.com |
| `blog-template/` | `thetecnoagrarian` | `https://github.com/thetecnoagrarian/blog-template.git` | Demo site deployed as demo.thetecnoagrarian.com |

## Deployment Workflow

### Code Path
Local → GitHub → Live server (`git pull --ff-only`)

### Repository Management Commands

```bash
# Set up remote URLs for each project
cd fruitionforestgarden
git remote set-url origin https://github.com/fruitionforestgarden/fruitionforestgarden.git

cd ../thetecnoagrarian  
git remote set-url origin https://github.com/thetecnoagrarian/thetecnoagrarian.git

cd ../blog-template
git remote set-url origin https://github.com/thetecnoagrarian/blog-template.git
```

### Server Deployment Paths

- `fruitionforestgarden.com` → `/var/www/fruitionforestgarden/current`
- `thetecnoagrarian.com` → `/var/www/thetecnoagrarian/current`  
- `demo.thetecnoagrarian.com` → `/var/www/demo-template/current`

## Important Notes

1. **Account Separation**: FruitionForestGarden has its own GitHub account for complete independence
2. **Shared Account**: TheTecnoagrarian and Blog-Template share the `thetecnoagrarian` GitHub account
3. **Repository Isolation**: Each project has its own repository, even when sharing a GitHub account
4. **Deployment Isolation**: Each project deploys to its own server directory and PM2 process

## Access Management

- **FruitionForestGarden**: Requires access to `fruitionforestgarden` GitHub account
- **TheTecnoagrarian**: Requires access to `thetecnoagrarian` GitHub account  
- **Blog-Template**: Requires access to `thetecnoagrarian` GitHub account

## CI/CD Considerations

When setting up automated deployment:
- Each repository needs its own deployment webhook
- Server needs access to both GitHub accounts
- PM2 processes are isolated by project name (`ffg`, `ta`, `demo`)
