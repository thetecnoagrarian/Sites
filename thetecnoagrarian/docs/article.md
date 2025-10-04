# Debugging Dynamic OG Image Tags in a Real-World Node.js Project: A Journey

## The Challenge

Our goal was simple: ensure every blog post on Fruition Forest Garden displays the correct image when shared on Facebook and other social platforms. This meant dynamically generating the `<meta property="og:image">` tag for each post, using the first image associated with the post, not a static fallback.

But what should have been a straightforward feature turned into a multi-day debugging adventure.

## The Problems We Faced

- **Static OG tags everywhere:** The site originally used static OG tags in the main layout, so every post shared the same image.
- **Middleware order confusion:** Our first attempt used an Express middleware to inject OG tags, but it ran before the post data was available, so it always fell back to the default image.
- **Multiple OG tag systems:** For a while, both the old middleware and the new route-based OG tag logic were running, causing the default image to overwrite the correct one.
- **Deployment drift:** Sometimes, the live server had changes not in GitHub, or vice versa, making it hard to know which code was actually running.
- **Git and deployment gotchas:** Local changes and untracked files on the live server blocked updates from GitHub, leading to confusion and failed deployments.
- **Debugging in the dark:** It was easy to check the browser console, but the real answers were in the server logs and the page source.

## How We Overcame Them

1. **Refactored OG tag logic:** We moved OG tag generation into the route handler, ensuring it always had access to the post data and could use the correct image.
2. **Removed legacy middleware:** We deleted the old res.send-intercepting middleware to prevent it from overwriting our new OG tags.
3. **Debugged with intent:** We used unique query strings in the OG image URL and checked both server logs and page source to confirm the correct code path was running.
4. **Enforced a clean workflow:** We documented and followed a strict process: all changes are made locally, pushed to GitHub, and only then deployed to the live server. The live server is never edited directly.
5. **Resolved git conflicts:** We used `git reset --hard` and `git clean -fd` to force the live server to match GitHub, ensuring a single source of truth.
6. **Validated with real tools:** We used the Facebook Sharing Debugger and browser page source to confirm the OG tags were correct.

## Lessons Learned

- **Middleware order matters:** In Express, data must be available before you generate dynamic tags.
- **Always check the page source:** The browser console is for JS, but OG tags are in the HTML.
- **Keep your environments in sync:** Use Git and a clear deployment workflow to avoid confusion.
- **Debug with unique markers:** Adding a `?debug=1` to the OG image URL made it easy to confirm which code path was running.
- **Don’t be afraid to reset:** Sometimes, the fastest way to fix a deployment is to force the server to match GitHub.

## The Result

After all this, every post now displays the correct OG image when shared. The workflow is clean, the code is maintainable, and we have a robust process for future changes.

**This is what real-world debugging and DevOps looks like: persistent, methodical, and always learning.** 