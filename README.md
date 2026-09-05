# Future Forward India

Build a mobile-first PWA called “We the Future” (WTF) for India. It shows government projects based on a user’s location, with map/list discovery, search, and filters for Planned, Ongoing, Delayed, Completed, and Finished Early. Make Material 3 the design language. Create a realistic testable MVP with seeded example Indian projects and an evidence panel on every project that shows official source links, source type, verification status, confidence, last verified date, and extracted evidence. Write project details in clear plain English. Design a strict separation between verified project facts/timeline and community ratings, reviews, feedback, and user images. Enable Lovable Cloud for data, authentication-ready user content, and an internal AI research-agent workflow concept that discovers candidate projects from official data sources, retains citations, and sends them through a reviewer verification queue before publishing as verified. Add basic common public-platform AI moderation for review text and uploaded images. Mask profanity or flagged words with asterisks where appropriate rather than silently hiding it; provide moderation labels and enforce hold/blur/remove for unsafe content according to severity. Include a reviewer/admin verification workflow in the UI with clear statuses. Make this polished enough to test, responsive, and include a guided empty/loading/permission-denied state for location. Do not implement Android packaging yet.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
