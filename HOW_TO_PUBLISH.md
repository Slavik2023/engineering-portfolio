# How to Publish This Portfolio

Step-by-step to turn this folder into a public GitHub repo recruiters
can browse.

## 1. Copy the folder out of the main project

```bash
# from your dev machine, somewhere outside the proprietary repo:
cp -r <path-to-main-project>/portfolio  ~/engineering-portfolio
cd ~/engineering-portfolio
```

The `portfolio/` directory inside the main project is already added to
the main repo's `.gitignore`, so it will not accidentally commit there.

## 2. Make it its own git repo

```bash
git init
git add .
git commit -m "feat: initial portfolio drop"
```

## 3. Create a public GitHub repo

Pick a neutral name — nothing that ties it to a specific employer or
product. Some options:

- `engineering-portfolio`
- `production-snippets`
- `backend-snippets`
- `full-stack-portfolio`
- `<your-handle>-portfolio`

```bash
gh repo create engineering-portfolio --public --source=. --remote=origin
git push -u origin master
```

(Or create it via the GitHub web UI and `git remote add origin <url>` +
`git push -u origin master`.)

## 4. Polish

Optional but worth 30 minutes:

- Add a profile picture / cover image to the repo
- Pin it on your GitHub profile (Customize profile → Pinned repositories)
- Link to it from your CV / LinkedIn / portfolio site
- Make sure the README renders well on GitHub mobile (it should — no
  HTML tricks used, just standard GitHub-flavored Markdown)

## 5. What to link from your CV

Single line. Compact:

```
Engineering portfolio: github.com/<you>/engineering-portfolio
```

In a more verbose CV section:

```
Selected engineering work from a production social platform
(~200 REST endpoints, 100K LOC, live in production):
github.com/<you>/engineering-portfolio
  → tamper-evident hash-chained audit log
  → cross-platform PWA install flow
  → 4-layer admin authentication
  → strict-CSP hardening
  → war stories: hash-chain race, silent CSP block, Vite chunk mystery
```

## 6. About anonymity

The snippets do not name the product or the company. If you want to
keep it that way — good, the portfolio stands on its own merits. If
during an interview the recruiter asks "what product is this from?",
you can choose to share or not depending on the context. Either way,
the code and the war stories carry the signal.

## 7. Update over time

As you ship more interesting work, add new snippets / case studies.
A portfolio that grows is a stronger signal than a static one.
