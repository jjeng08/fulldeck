# FullDeck Branching Strategy

## Environment Branches

Our GitFlow follows environment progression:

```
dev → qa → stage → prod → main
```

### Branch Descriptions

- **`dev`** - Active development branch (default for new features)
- **`qa`** - Quality assurance testing environment
- **`stage`** - Staging environment for pre-production testing
- **`prod`** - Production environment
- **`main`** - Latest stable release (mirrors prod)

### Environment Configuration

Each branch corresponds to environment files:
- `dev` → `.env.dev` 
- `qa` → `.env.qa`
- `stage` → `.env.stage` 
- `prod` → `.env.production`

### Workflow

1. **Development**: Work in `dev` branch
   ```bash
   git checkout dev
   git pull origin dev
   # Make changes
   git add .
   git commit -m "Feature: description"
   git push origin dev
   ```

2. **Promotion to QA**: Merge dev → qa
   ```bash
   git checkout qa
   git pull origin qa
   git merge dev
   git push origin qa
   ```

3. **Promotion to Stage**: Merge qa → stage
   ```bash
   git checkout stage
   git pull origin stage
   git merge qa
   git push origin stage
   ```

4. **Promotion to Production**: Merge stage → prod
   ```bash
   git checkout prod
   git pull origin prod
   git merge stage
   git push origin prod
   ```

5. **Release**: Merge prod → main
   ```bash
   git checkout main
   git pull origin main
   git merge prod
   git tag v1.0.0
   git push origin main --tags
   ```

### Branch Protection Rules (Recommended)

- **main**: Require pull request reviews, no direct pushes
- **prod**: Require pull request reviews, no direct pushes  
- **stage**: Require pull request reviews
- **qa**: Allow direct pushes from dev
- **dev**: Allow direct pushes (development branch)

### Environment URLs

- **Development**: http://localhost:3000 (local)
- **QA**: https://qa.fulldeck.example.com
- **Stage**: https://stage.fulldeck.example.com  
- **Production**: https://fulldeck.example.com