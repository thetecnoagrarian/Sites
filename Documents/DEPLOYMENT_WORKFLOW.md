# Deployment Workflow - CORRECT PROCESS

## ✅ **Successful Deployment Process (Just Used)**

This is the **correct and working** deployment workflow that was successfully executed without any errors or password prompts.

### **Step 1: Local Development**
```bash
# Make code changes locally
# Edit files in your local workspace
# Test changes locally if needed
```

### **Step 2: Commit Changes**
```bash
# Stage the files you want to commit
git add fruitionforestgarden/src/views/admin/new-post.hbs thetecnoagrarian/src/views/admin/new-post.hbs

# Commit with descriptive message
git commit -m "Add visual drop zones for drag-and-drop image reordering

- Added clear drop zones between images with visual indicators
- Drop zones show 'Drop here to make first' and 'Drop here to insert after image X'
- Added hover effects and drag-over visual feedback
- Drop zones change color when dragging over them (green when valid drop)
- Much easier to target specific positions (first, last, between images)
- Applied to both fruitionforestgarden and thetecnoagrarian sites
- Users can now easily drag images to exact positions they want"
```

### **Step 3: Push to GitHub**
```bash
# Push changes to GitHub repository
git push origin main
```

### **Step 4: Deploy to Live Server**
```bash
# Deploy to production server (NO PASSWORD REQUIRED)
ssh deploy@172.236.119.220 "cd /opt/Sites && docker-compose -f docker-compose.prod.yml up --build -d fruitionforestgarden"
```

## **Key Success Factors**

### ✅ **What Made This Work**
1. **No SSH key issues** - The SSH key was already properly configured
2. **No password prompts** - Authentication was seamless
3. **Clean git workflow** - Changes committed and pushed properly
4. **Correct deployment command** - Used `--build` flag to ensure latest code
5. **Single service deployment** - Only rebuilt the specific service that changed

### ✅ **Command Breakdown**
- `ssh deploy@172.236.119.220` - Connect to server (no password needed)
- `cd /opt/Sites` - Navigate to project directory
- `docker-compose -f docker-compose.prod.yml` - Use production compose file
- `up --build -d` - Build and start container in detached mode
- `fruitionforestgarden` - Only rebuild the specific service

## **Why This Worked vs Previous Attempts**

### ❌ **Previous Issues**
- Used `restart` instead of `--build` (didn't pick up code changes)
- SSH key confusion (wrong key names)
- Password prompts due to authentication issues
- Deployed all services instead of just the changed one

### ✅ **This Success**
- Used `--build` flag (ensures latest code is used)
- SSH key was already properly loaded
- No authentication issues
- Targeted deployment (only rebuilt what changed)

## **Standard Workflow Going Forward**

### **For Code Changes:**
1. **Edit locally** - Make changes in your workspace
2. **Commit** - `git add` → `git commit -m "description"`
3. **Push** - `git push origin main`
4. **Deploy** - `ssh deploy@172.236.119.220 "cd /opt/Sites && docker-compose -f docker-compose.prod.yml up --build -d [SERVICE_NAME]"`

### **For Database Changes:**
1. **Edit locally** - Make database schema changes
2. **Commit** - `git add` → `git commit -m "description"`
3. **Push** - `git push origin main`
4. **Deploy** - `ssh deploy@172.236.119.220 "cd /opt/Sites && docker-compose -f docker-compose.prod.yml up --build -d [SERVICE_NAME]"`

### **For Both Sites:**
- **Fruition Forest Garden**: `fruitionforestgarden`
- **The Tecnoagrarian**: `thetecnoagrarian`

## **Important Notes**

### ✅ **Always Use `--build`**
- `docker-compose up --build -d` ensures latest code is used
- `docker-compose restart` does NOT pick up code changes
- `docker-compose up -d` without `--build` may use cached images

### ✅ **Target Specific Services**
- Only rebuild the service that changed
- Faster deployment
- Less resource usage
- More reliable

### ✅ **SSH Key Status**
- SSH key is properly configured on server
- No password prompts needed
- Authentication works seamlessly

## **Example Commands**

### **Deploy Fruition Forest Garden:**
```bash
ssh deploy@172.236.119.220 "cd /opt/Sites && docker-compose -f docker-compose.prod.yml up --build -d fruitionforestgarden"
```

### **Deploy The Tecnoagrarian:**
```bash
ssh deploy@172.236.119.220 "cd /opt/Sites && docker-compose -f docker-compose.prod.yml up --build -d thetecnoagrarian"
```

### **Deploy Both Sites:**
```bash
ssh deploy@172.236.119.220 "cd /opt/Sites && docker-compose -f docker-compose.prod.yml up --build -d"
```

## **Troubleshooting**

### **If Deployment Fails:**
1. Check if service is running: `docker-compose ps`
2. Check logs: `docker-compose logs [SERVICE_NAME]`
3. Force rebuild: `docker-compose up --build --force-recreate -d [SERVICE_NAME]`

### **If Code Changes Don't Appear:**
1. Verify git push succeeded: `git log --oneline -1`
2. Check server has latest code: `git log --oneline -1` on server
3. Use `--build` flag: `docker-compose up --build -d [SERVICE_NAME]`

---

**This workflow was successfully tested and deployed visual drop zones for drag-and-drop image reordering without any errors or password prompts.**
