# Tunely

Multi-user music queue platform with Spotify integration, democratic voting, and AI-powered discovery.

## Features

- 🎵 Shared music queue with upvoting
- 🤖 Smart playlist generation (multi-member, trending, Last.fm discovery)
- 🔒 Private rooms with QR-code invites
- 👥 Friend system with guest conversion
- 🎨 Playlist modes (Dinner, Party, Background, Workout)
- 📱 Guest mode (join without account)

## Tech Stack

- Next.js 15 + TypeScript
- NextAuth (Spotify OAuth + email/password)
- Prisma + SQLite
- Tailwind CSS v4
- Last.fm API
- Spotify Web API

## Setup

```bash
npm install
cp .env.example .env
# Fill in Spotify credentials + NextAuth secret
npx prisma db push
npm run dev
```

## Deployment

Deployed at https://musikrum.u6x.one (to be updated to tunely domain)

## License

MIT
